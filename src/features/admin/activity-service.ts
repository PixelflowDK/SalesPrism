import "server-only";

import {
  ServerActionResponse,
} from "@/features/common/server-action-response";
import { ConfigContainer } from "@/features/common/services/cosmos";
import { safeLog } from "@/features/common/services/safe-logger";
import { uniqueId } from "@/features/common/util";
import { SqlQuerySpec } from "@azure/cosmos";
import { z } from "zod";
import { FindUsersForTenant, UserAccount } from "./user-service";

/**
 * Activity/usage analytics — SAD v2.7 §8.6.
 *
 * Same container/partition convention as `user-service.ts`: `ConfigContainer`,
 * partitioned on `tenantSlug` (not on the acting user), so both the
 * per-user rollup and the tenant-wide overview are simple, cheap,
 * single-partition Cosmos SQL queries — no new infra, no cross-container
 * aggregation, per the Stage 5a brief.
 *
 * PII minimization (Codex review #1 finding 7): event `metadata` is a
 * strict allow-list of numeric/enum fields (session id, prompt length,
 * tokens used, model tier). It deliberately does NOT carry prompt text,
 * document filenames, or search filters — the same minimization principle
 * as `safe-logger.ts`, applied to what we choose to persist, not just what
 * we log.
 */
export const ACTIVITY_EVENT_ATTRIBUTE = "ACTIVITY_EVENT";

export const ActivityEventTypeSchema = z.enum(["prompt", "login", "upload", "session-end"]);
export type ActivityEventType = z.infer<typeof ActivityEventTypeSchema>;

export const ActivityEventMetadataSchema = z.object({
  sessionId: z.string().optional(),
  promptLength: z.number().int().nonnegative().optional(),
  tokensUsed: z.number().int().nonnegative().optional(),
  modelTier: z.string().optional(),
});
export type ActivityEventMetadata = z.infer<typeof ActivityEventMetadataSchema>;

export const ActivityEventSchema = z.object({
  id: z.string(),
  type: z.literal(ACTIVITY_EVENT_ATTRIBUTE),
  /** Cosmos partition key — set to `tenantSlug` (see module doc above). */
  userId: z.string(),
  tenantSlug: z.string(),
  /** SHA-256 hash of the acting user's email — never the raw email/name. */
  actorHashedId: z.string(),
  eventType: ActivityEventTypeSchema,
  timestamp: z.string(),
  metadata: ActivityEventMetadataSchema,
});
export type ActivityEvent = z.infer<typeof ActivityEventSchema>;

/** Best-effort event write — analytics must never break the feature it observes. */
const recordEvent = async (
  tenantSlug: string,
  actorHashedId: string,
  eventType: ActivityEventType,
  metadata: ActivityEventMetadata
): Promise<void> => {
  try {
    const model: ActivityEvent = {
      id: `evt-${uniqueId()}`,
      type: ACTIVITY_EVENT_ATTRIBUTE,
      userId: tenantSlug,
      tenantSlug,
      actorHashedId,
      eventType,
      timestamp: new Date().toISOString(),
      metadata,
    };
    await ConfigContainer().items.create<ActivityEvent>(model);
  } catch {
    safeLog.error("admin.activity.record-failed", { tenantSlug, eventType });
  }
};

export const RecordPromptEvent = async (props: {
  tenantSlug: string;
  actorHashedId: string;
  sessionId: string;
  promptLength: number;
  tokensUsed?: number;
  modelTier?: string;
}): Promise<void> =>
  recordEvent(props.tenantSlug, props.actorHashedId, "prompt", {
    sessionId: props.sessionId,
    promptLength: props.promptLength,
    tokensUsed: props.tokensUsed,
    modelTier: props.modelTier,
  });

export const RecordUploadEvent = async (props: {
  tenantSlug: string;
  actorHashedId: string;
}): Promise<void> => recordEvent(props.tenantSlug, props.actorHashedId, "upload", {});

export const RecordLoginEvent = async (props: {
  tenantSlug: string;
  actorHashedId: string;
}): Promise<void> => recordEvent(props.tenantSlug, props.actorHashedId, "login", {});

const INACTIVE_THRESHOLD_DAYS = 30;

export type ActivityOverview = {
  totalPromptsThisMonth: number;
  activeUsers: number;
  inactiveUsers30d: number;
  uploadsThisMonth: number;
};

export type PerUserActivity = {
  hashedId: string;
  displayName: string;
  email: string;
  status: UserAccount["status"];
  lastLoginAt: string | null;
  daysSinceLastLogin: number | null;
  promptsTotal: number;
  promptsThisMonth: number;
  uploadsTotal: number;
  tokensUsedTotal: number;
};

const isSameMonth = (iso: string, reference: Date): boolean => {
  const d = new Date(iso);
  return (
    d.getUTCFullYear() === reference.getUTCFullYear() &&
    d.getUTCMonth() === reference.getUTCMonth()
  );
};

/** All events for a tenant — single partition-key query (see module doc above). */
const findEventsForTenant = async (
  tenantSlug: string
): Promise<ServerActionResponse<ActivityEvent[]>> => {
  try {
    const querySpec: SqlQuerySpec = {
      query:
        "SELECT * FROM root r WHERE r.type=@type AND r.tenantSlug=@tenantSlug ORDER BY r.timestamp DESC",
      parameters: [
        { name: "@type", value: ACTIVITY_EVENT_ATTRIBUTE },
        { name: "@tenantSlug", value: tenantSlug },
      ],
    };

    const { resources } = await ConfigContainer()
      .items.query<ActivityEvent>(querySpec, { partitionKey: tenantSlug })
      .fetchAll();

    return { status: "OK", response: resources };
  } catch (error) {
    safeLog.error("admin.activity.list-failed", { tenantSlug });
    return { status: "ERROR", errors: [{ message: "Unable to load activity events." }] };
  }
};

export const GetActivityOverview = async (
  tenantSlug: string
): Promise<ServerActionResponse<ActivityOverview>> => {
  const [usersResponse, eventsResponse] = await Promise.all([
    FindUsersForTenant(tenantSlug),
    findEventsForTenant(tenantSlug),
  ]);

  if (usersResponse.status !== "OK") return usersResponse;
  if (eventsResponse.status !== "OK") return eventsResponse;

  const now = new Date();
  const events = eventsResponse.response;

  const totalPromptsThisMonth = events.filter(
    (e) => e.eventType === "prompt" && isSameMonth(e.timestamp, now)
  ).length;
  const uploadsThisMonth = events.filter(
    (e) => e.eventType === "upload" && isSameMonth(e.timestamp, now)
  ).length;

  const activeUsers = usersResponse.response.filter((u) => u.status === "active").length;
  const inactiveUsers30d = usersResponse.response.filter((u) => {
    if (!u.lastLoginAt) return true;
    const days = (now.getTime() - new Date(u.lastLoginAt).getTime()) / (1000 * 60 * 60 * 24);
    return days >= INACTIVE_THRESHOLD_DAYS;
  }).length;

  return {
    status: "OK",
    response: { totalPromptsThisMonth, activeUsers, inactiveUsers30d, uploadsThisMonth },
  };
};

export const GetPerUserActivity = async (
  tenantSlug: string
): Promise<ServerActionResponse<PerUserActivity[]>> => {
  const [usersResponse, eventsResponse] = await Promise.all([
    FindUsersForTenant(tenantSlug),
    findEventsForTenant(tenantSlug),
  ]);

  if (usersResponse.status !== "OK") return usersResponse;
  if (eventsResponse.status !== "OK") return eventsResponse;

  const now = new Date();
  const events = eventsResponse.response;

  const rows: PerUserActivity[] = usersResponse.response.map((user) => {
    const ownEvents = events.filter((e) => e.actorHashedId === user.hashedId);
    const promptsTotal = ownEvents.filter((e) => e.eventType === "prompt").length;
    const promptsThisMonth = ownEvents.filter(
      (e) => e.eventType === "prompt" && isSameMonth(e.timestamp, now)
    ).length;
    const uploadsTotal = ownEvents.filter((e) => e.eventType === "upload").length;
    const tokensUsedTotal = ownEvents.reduce(
      (sum, e) => sum + (e.metadata.tokensUsed ?? 0),
      0
    );

    return {
      hashedId: user.hashedId,
      displayName: user.displayName,
      email: user.email,
      status: user.status,
      lastLoginAt: user.lastLoginAt,
      daysSinceLastLogin: user.lastLoginAt
        ? Math.floor((now.getTime() - new Date(user.lastLoginAt).getTime()) / (1000 * 60 * 60 * 24))
        : null,
      promptsTotal,
      promptsThisMonth,
      uploadsTotal,
      tokensUsedTotal,
    };
  });

  return { status: "OK", response: rows };
};

const csvEscape = (value: string | number | null): string => {
  const str = value === null ? "" : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

/** Server-rendered CSV body for the `/admin/analytics` export route — admin-guarded at the route level. */
export const BuildActivityCsv = async (
  tenantSlug: string
): Promise<ServerActionResponse<string>> => {
  const rowsResponse = await GetPerUserActivity(tenantSlug);
  if (rowsResponse.status !== "OK") return rowsResponse;

  const header = [
    "displayName",
    "email",
    "status",
    "lastLoginAt",
    "daysSinceLastLogin",
    "promptsTotal",
    "promptsThisMonth",
    "uploadsTotal",
    "tokensUsedTotal",
  ];

  const lines = [header.join(",")];
  for (const row of rowsResponse.response) {
    lines.push(
      [
        csvEscape(row.displayName),
        csvEscape(row.email),
        csvEscape(row.status),
        csvEscape(row.lastLoginAt),
        csvEscape(row.daysSinceLastLogin),
        csvEscape(row.promptsTotal),
        csvEscape(row.promptsThisMonth),
        csvEscape(row.uploadsTotal),
        csvEscape(row.tokensUsedTotal),
      ].join(",")
    );
  }

  return { status: "OK", response: lines.join("\n") + "\n" };
};

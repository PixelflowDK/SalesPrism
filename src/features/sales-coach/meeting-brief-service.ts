import "server-only";

import {
  ServerActionResponse,
  zodErrorsToServerActionErrors,
} from "@/features/common/server-action-response";
import { ConfigContainer } from "@/features/common/services/cosmos";
import { safeLog } from "@/features/common/services/safe-logger";
import { uniqueId } from "@/features/common/util";
import { SqlQuerySpec } from "@azure/cosmos";
import {
  MEETING_BRIEF_ATTRIBUTE,
  MeetingBrief,
  MeetingBriefDocument,
  MeetingBriefDocumentSchema,
} from "./models";
import { LinkMeetingBriefToCustomer } from "./customer-entity-service";

/**
 * Saved MeetingBrief persistence — F-01 "Brief kan gemmes og genåbnes".
 * Same `tenantSlug` partition / `ownerId` scoping convention as
 * `customer-entity-service.ts` — see models.ts module doc.
 */

const meetingBriefDocId = () => `brief-${uniqueId()}`;

const parseMeetingBriefDocument = (
  raw: unknown
): ServerActionResponse<MeetingBriefDocument> => {
  const parsed = MeetingBriefDocumentSchema.safeParse(raw);
  if (!parsed.success) {
    return { status: "ERROR", errors: zodErrorsToServerActionErrors(parsed.error.errors) };
  }
  return { status: "OK", response: parsed.data };
};

/**
 * Persists a generated MeetingBrief and links it into the customer entity's
 * `meetingHistory` (creating the entity if this is the seller's first
 * interaction with this customer). Called from `meeting-prep-tool.ts`.
 */
export const CreateMeetingBrief = async (input: {
  tenantSlug: string;
  ownerId: string;
  chatThreadId: string;
  customerEntityId: string | null;
  brief: MeetingBrief;
}): Promise<ServerActionResponse<MeetingBriefDocument>> => {
  try {
    const now = new Date().toISOString();
    const model: MeetingBriefDocument = {
      id: meetingBriefDocId(),
      type: MEETING_BRIEF_ATTRIBUTE,
      userId: input.tenantSlug,
      tenantSlug: input.tenantSlug,
      ownerId: input.ownerId,
      chatThreadId: input.chatThreadId,
      customerEntityId: input.customerEntityId,
      brief: input.brief,
      createdAt: now,
    };

    const parsed = MeetingBriefDocumentSchema.safeParse(model);
    if (!parsed.success) {
      return { status: "ERROR", errors: zodErrorsToServerActionErrors(parsed.error.errors) };
    }

    const { resource } = await ConfigContainer().items.create<MeetingBriefDocument>(parsed.data);
    if (!resource) {
      return { status: "ERROR", errors: [{ message: "Unable to save meeting brief." }] };
    }

    await LinkMeetingBriefToCustomer({
      tenantSlug: input.tenantSlug,
      ownerId: input.ownerId,
      customerName: input.brief.customerName,
      meetingBriefId: resource.id,
    });

    return { status: "OK", response: resource };
  } catch (error) {
    safeLog.error("sales-coach.meeting-brief.create-failed", { tenantSlug: input.tenantSlug });
    return { status: "ERROR", errors: [{ message: "Unable to save meeting brief." }] };
  }
};

/** All saved briefs for the current seller — powers the `/briefs` list route. */
export const FindMeetingBriefsForOwner = async (
  tenantSlug: string,
  ownerId: string
): Promise<ServerActionResponse<MeetingBriefDocument[]>> => {
  try {
    const querySpec: SqlQuerySpec = {
      query:
        "SELECT * FROM root r WHERE r.type=@type AND r.tenantSlug=@tenantSlug AND r.ownerId=@ownerId ORDER BY r.createdAt DESC",
      parameters: [
        { name: "@type", value: MEETING_BRIEF_ATTRIBUTE },
        { name: "@tenantSlug", value: tenantSlug },
        { name: "@ownerId", value: ownerId },
      ],
    };

    const { resources } = await ConfigContainer()
      .items.query<MeetingBriefDocument>(querySpec, { partitionKey: tenantSlug })
      .fetchAll();

    return { status: "OK", response: resources };
  } catch (error) {
    safeLog.error("sales-coach.meeting-brief.list-failed", { tenantSlug });
    return { status: "ERROR", errors: [{ message: "Unable to load meeting briefs." }] };
  }
};

/**
 * Single brief by id — re-checks `ownerId` even after the
 * partition-scoped point read (defense in depth, same pattern as
 * `FindCustomerEntityById`). Used by both the `/briefs/[id]` page (server
 * render) and the chat-stream `{% meeting-brief %}` embed's API route.
 */
export const FindMeetingBriefById = async (
  tenantSlug: string,
  ownerId: string,
  id: string
): Promise<ServerActionResponse<MeetingBriefDocument>> => {
  try {
    const { resource } = await ConfigContainer().item(id, tenantSlug).read<MeetingBriefDocument>();

    if (!resource || resource.tenantSlug !== tenantSlug || resource.ownerId !== ownerId) {
      return { status: "NOT_FOUND", errors: [{ message: "Meeting brief not found." }] };
    }

    return parseMeetingBriefDocument(resource);
  } catch (error) {
    safeLog.error("sales-coach.meeting-brief.get-failed", { tenantSlug });
    return { status: "ERROR", errors: [{ message: "Unable to load meeting brief." }] };
  }
};

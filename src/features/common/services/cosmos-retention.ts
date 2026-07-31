import "server-only";

import { ConfigContainer, HistoryContainer } from "./cosmos";
import { safeLog } from "./safe-logger";

/**
 * SAD v2.7 §32.1 data-retention TTLs, applied to Cosmos DB.
 *
 * `infra/modules/cosmos-db.bicep` provisions only the Cosmos ACCOUNT — the
 * `chat`/`config` database and `history`/`config` containers used by
 * `common/services/cosmos.ts` are created out-of-band (not by this repo's
 * Bicep; see the security-gdpr-review, "Could NOT verify: Cosmos container
 * `defaultTtl`"). Since this app cannot rely on provisioning to set
 * container-level TTL, it applies it itself here, at runtime, the same
 * "seed on first boot" idiom already used by `tenant-theme.ts`'s
 * `EnsureTenantTheme` for the same private-endpoint-reachability reason.
 *
 * See docs/known-limitations.md for the parts of SAD §32.1's retention
 * table this module does NOT cover (AI Search has no native per-document
 * TTL; blob lifecycle is a Bicep-level policy, see
 * infra/modules/storage.bicep).
 */

/** SAD §32.1: chat-prompts/completions + uploaded-document metadata — 90 days. */
export const CHAT_HISTORY_TTL_SECONDS = 90 * 24 * 60 * 60; // 7,776,000

/** SAD §32.1: activity/usage logs — 30 days. */
export const ACTIVITY_EVENT_TTL_SECONDS = 30 * 24 * 60 * 60; // 2,592,000

/**
 * `HistoryContainer` holds ONLY chat data (`ChatThreadModel`,
 * `ChatMessageModel`, `ChatDocumentModel`, `ChatCitationModel` — see
 * chat-services/models.ts) — no tenant/account configuration lives here, so
 * a container-wide `defaultTtl` is safe and matches SAD §32.1's "chat
 * prompts and answers" / "uploaded documents" rows directly.
 */
const HISTORY_CONTAINER_DEFAULT_TTL = CHAT_HISTORY_TTL_SECONDS;

/**
 * `ConfigContainer` is MIXED: tenant-config singletons that must NEVER
 * expire (`TenantTheme`, `ModuleConfig`, `TagDimensions`, the GDPR erasure
 * audit trail — `gdpr-erasure-service.ts`) share it with `UserAccount`
 * (deleted only via the admin erasure flow, per SAD §32.1's "Konto-levetid"
 * row — never TTL), `CustomerEntity`/`MeetingBriefDocument` (no SAD-defined
 * retention period — erasure-on-request only, see
 * gdpr-erasure-service.ts's doc comment), and `ActivityEvent` (SAD §32.1:
 * 30 days).
 *
 * A single container-wide `defaultTtl` cannot distinguish between those —
 * it would silently expire `TenantTheme` along with everything else.
 * Cosmos's per-ITEM `ttl` override is the correct primitive: set the
 * CONTAINER default to `-1` ("TTL enabled, nothing expires unless the item
 * itself sets a `ttl`"), and let only `ActivityEvent` documents
 * (`admin/activity-service.ts`'s `recordEvent`) set their own
 * `ttl: ACTIVITY_EVENT_TTL_SECONDS` field. Every other document type in
 * this container simply never sets `ttl` and is therefore immune by
 * construction, not by a filter someone could forget.
 */
const CONFIG_CONTAINER_DEFAULT_TTL = -1;

type RetentionContainer = ReturnType<typeof HistoryContainer>;

const ensureContainerDefaultTtl = async (
  container: RetentionContainer,
  desiredDefaultTtl: number,
  label: string
): Promise<void> => {
  try {
    const { resource } = await container.read();
    if (!resource) {
      safeLog.warn("retention.container-not-found", { errorCode: label });
      return;
    }
    if (resource.defaultTtl === desiredDefaultTtl) {
      return; // already correct — no-op, no Cosmos write
    }
    const updated = { ...resource, defaultTtl: desiredDefaultTtl };
    await container.replace(updated);
    safeLog.info("retention.container-ttl-updated", { errorCode: label });
  } catch (error) {
    // Best-effort, matching `EnsureTenantTheme`/`EnsureUserOnLogin`
    // elsewhere in this codebase — a Cosmos control-plane hiccup here must
    // never block the authenticated app shell. If this keeps failing,
    // apply the container's `defaultTtl` manually — see
    // docs/known-limitations.md for the exact `az cosmosdb sql container
    // update` command.
    safeLog.error("retention.ensure-ttl-failed", { errorCode: label });
  }
};

let ensured = false;
let ensuring: Promise<void> | null = null;

/**
 * Idempotent, best-effort "ensure retention policy is applied" — called
 * once per authenticated request from `app/(authenticated)/layout.tsx`
 * (same call site as `EnsureUserOnLogin`), but memoized per App Service
 * process so normal request traffic only pays a boolean check, not a
 * Cosmos round-trip, after the first successful run on a given instance.
 */
export const EnsureContainerRetentionPolicies = async (): Promise<void> => {
  if (ensured) return;
  if (ensuring) return ensuring;

  ensuring = (async () => {
    await Promise.all([
      ensureContainerDefaultTtl(HistoryContainer(), HISTORY_CONTAINER_DEFAULT_TTL, "history"),
      ensureContainerDefaultTtl(ConfigContainer(), CONFIG_CONTAINER_DEFAULT_TTL, "config"),
    ]);
    ensured = true;
    ensuring = null;
  })();

  return ensuring;
};

/** Test-only reset of the per-process memoization — production code never calls this. */
export const __resetRetentionMemoizationForTests = (): void => {
  ensured = false;
  ensuring = null;
};

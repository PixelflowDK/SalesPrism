# GDPR Erasure + Retention Evidence

**Scope:** Full retention-chain verification for the Art. 17 erasure feature landed in
commit `d6fe070` (`feat(gdpr): Art. 17 erasure + retention across every store`).
**Branch:** `develop` @ `d6fe070` · **Date:** 2026-07-31 · **Verified by:** direct `az`
queries against the live `rg-azurechat-val1` validation stack (subscription **"Azure
subscription 1"**, id `ceb8f0de-f43f-4e86-8a39-3aa338af5e10`, confirmed via
`az account show`) plus source/Bicep reads. Read-only — no writes, no deployments, no
deletes were performed against Azure.

**Purpose:** `EraseDataSubject` (`src/features/admin/gdpr-erasure-service.ts`) and the
Cosmos TTL helper (`src/features/common/services/cosmos-retention.ts`) delete/anonymize
**active, queryable** data. That is necessary but not sufficient for Art. 17: backups,
soft-delete windows, derived stores, and telemetry can retain copies of the same personal
data for a period after an erasure request completes. This document traces that full
chain, store by store, and states plainly where the live configuration is weaker than the
SAD promised.

**Hard rule applied throughout:** no claim here is stronger than what was directly
verified. Anything not independently confirmed is listed in the "Not verified" section
instead of being asserted.

---

## 1. Cosmos DB backup/restore retention

**Command:**
```
az cosmosdb show --name cosmos-azurechat-val1 --resource-group rg-azurechat-val1
```

**Result (verified live, 2026-07-31):**
```json
"backupPolicy": {
  "type": "Periodic",
  "periodicModeProperties": {
    "backupIntervalInMinutes": 240,
    "backupRetentionIntervalInHours": 8,
    "backupStorageRedundancy": "Geo"
  }
}
```
`disableLocalAuth: false` (master key still a valid data-plane auth path — consistent
with `security-gdpr-review.md` H-1). `publicNetworkAccess: Disabled`, region
`Sweden Central`.

**What this means for an erased document:** the account takes a full backup every 4
hours and keeps the 2 most recent backups (8-hour retention window), geo-redundant. A
document erased by `EraseDataSubject` is removed from the live/queryable data
immediately, but a copy of it can persist inside an existing periodic backup for **up to
~8 hours** after the backup that captured it was taken — worst case, a document erased
moments after a backup snapshot remains recoverable from that snapshot for up to roughly
12 hours (8h retention + up to 4h until the pre-erasure state was last captured), until
the backup naturally rolls off.

**SAD comparison — reported plainly:** SAD §22.1 states the "recommended upgrade" is
**Continuous Backup** (`backupPolicy.type: 'Continuous'`, `tier: 'Continuous30Days'`) via
a Bicep parameter `enableContinuousBackup bool = true`, and calls this the accepted
"Beslutning" (decision) for Phase B onward. **That parameter does not exist anywhere in
this repo** (`grep -rn "enableContinuousBackup" infra/` returns nothing) and
`infra/modules/cosmos-db.bicep` sets no `backupPolicy` block at all, so the account sits
on the Azure **default** — Periodic, 4h/8h — not what the SAD says was decided. This is
**worse than the SAD implies**: Continuous30Days would put an erased document behind a
30-day point-in-time restore window (a longer worst case, but self-service and precise);
what's actually deployed is Periodic with a shorter but less controllable window (whole
backup sets, not selectively erasable). Either way, an Azure Support-mediated restore
from a periodic backup could theoretically reintroduce an already-erased subject's data
until that backup rolls off — this is a real, if short, gap between "erased" and "cannot
possibly recur."

---

## 2. Storage soft delete + versioning + lifecycle policy

**Commands:**
```
az storage account blob-service-properties show \
  --account-name stval136sepgklp44gk --resource-group rg-azurechat-val1

az storage account management-policy show \
  --account-name stval136sepgklp44gk --resource-group rg-azurechat-val1
```

**Result (verified live, 2026-07-31):**
```json
"deleteRetentionPolicy": { "enabled": false, "days": null, "allowPermanentDelete": false },
"containerDeleteRetentionPolicy": null,
"isVersioningEnabled": null,
"changeFeed": null
```
`management-policy show` → **`ManagementPolicyNotFound`** (HTTP error,
`Code: ManagementPolicyNotFound`) — no lifecycle policy is currently applied to this
storage account at all.

**What this means:** blob soft delete, container soft delete, blob versioning, and blob
change feed are all **disabled** on the live `stval136sepgklp44gk` account. This is good
news for erasure completeness (a hard-deleted blob has no soft-delete shadow copy sitting
behind it waiting to be purged) but it also means there is currently **no** accidental-
deletion recovery window for this account — a tradeoff, not called out anywhere as a
deliberate decision.

**The commit-d6fe070 lifecycle policy is source-only, not yet live.** `infra/modules/
storage.bicep` (this same commit) adds a `Microsoft.Storage/storageAccounts/
managementPolicies` resource named `default` with a `delete-images-after-90-days` rule
(`prefixMatch: ["images/"]`, `daysAfterModificationGreaterThan: 90`). The live account has
no such policy (confirmed by the `ManagementPolicyNotFound` error above), and
`az deployment group list -g rg-azurechat-val1` shows the last `deploy-storage-val1` ran
**2026-07-30T16:34:41Z** — before `d6fe070` was committed (**2026-07-31T09:11:30+02:00**,
per `git log -1 --format="%H %ad" d6fe070`). The 90-day blob lifecycle rule exists in code
today; it has **not yet been deployed** to `rg-azurechat-val1` or any other stack. Until a
future `deploy-storage-*` run picks it up, blobs older than 90 days in the `images/`
prefix are not automatically deleted on this environment.

**Interaction once deployed:** because soft delete/versioning are off, the lifecycle
policy's hard delete (`daysAfterModificationGreaterThan: 90`) will be a genuine,
unrecoverable delete with no soft-delete shadow to also expire — simpler than the usual
"lifecycle deletes the live blob, soft-delete retention clock then starts on the deleted
version" interaction, precisely because this account isn't using soft delete. Per-subject
erasure (`eraseBlobsForThreads`) already deletes the specific blobs immediately and does
not wait on this policy; the 90-day rule is a backstop for images whose owning subject
never triggers an erasure request.

**Addendum 2026-08-11 (SR-007, both findings above resolved, with a new documented tradeoff):**
- **Lifecycle policy:** re-verified live — `management-policy show` now returns the
  `delete-images-after-90-days` rule (`lastModifiedTime: 2026-08-10T14:39:02Z`), matching
  committed source exactly. It was deployed sometime between this document's original
  2026-07-31 capture and this addendum; exact date/actor not tracked here. No longer "not yet
  deployed."
- **Blob soft delete:** deliberately enabled 2026-08-11, reversing the "good news for erasure
  completeness" framing above. `deleteRetentionPolicy: { enabled: true, days: 7 }` is now live
  (`az storage account blob-service-properties show` confirms `enabled: true, days: 7`), added
  via a new `blobSoftDeleteRetentionDays` param in `modules/storage.bicep` (default 7). **This
  reintroduces exactly the soft-delete shadow-copy window the paragraph above said didn't
  exist:** `eraseBlobsForThreads`'s hard delete now leaves a recoverable copy in Azure for up to
  7 days before permanent purge. This is a deliberate tradeoff (real accidental-deletion
  protection, previously entirely absent, in exchange for a short, explicit, and now-documented
  GDPR erasure tail) — not an oversight. See the row 7 (`Blob storage (images/ container)`)
  table update below and `docs/known-limitations.md` for the rationale. Container soft delete
  and blob versioning remain disabled — out of scope for this fix.

---

## 3. Azure AI Search deletion propagation

**Verified from source, not from a live query** (no way to safely test a real
`deleteDocuments` call read-only, and Azure AI Search's internal replica/segment-merge
timing is not exposed via any `az search` read command):

`DeleteDocumentsByUser` (`src/features/chat-page/chat-services/azure-ai-search/
azure-ai-search.ts:274-320`) calls the SDK's `deleteDocuments()` directly against the
index, per matched document. Per Microsoft's documented behavior for Azure AI Search
(cited from public product documentation, not independently re-verified against this
specific index): a successful `deleteDocuments` call removes the document from the
**queryable** index essentially immediately — Search's consistency model marks deletes
as visible to subsequent queries right away, well under the multi-hour windows relevant
to the other stores in this document. `srch-azurechat-val1` is `basic` SKU,
`replicaCount: 1`, `partitionCount: 1` (verified via `az search service show`) — single
replica means there is no secondary replica potentially lagging behind on the delete.

**Honest limits on what could be verified:**
- Whether Azure AI Search's underlying storage retains any transient, non-queryable
  remnant of a deleted document (e.g. in write-ahead logs or between-merge index
  segments) before background compaction reclaims the space is **not documented by
  Microsoft as customer-observable and was not verified here** — it is an internal
  implementation detail of the managed service, not something `az search` or the data
  plane exposes.
- SAD §22.2 is explicit that **Azure AI Search has no platform-level backup/restore
  surfaced to customers** — confirmed by reading `docs/Sales_Prism_SAD_v2.7.md:1548-1565`
  and consistent with public Azure AI Search documentation. There is therefore no
  customer-facing "AI Search backup copy" analogous to Cosmos periodic backups to reason
  about — the honest position is "we cannot observe or rule out an internal transient
  copy, but there is no customer-accessible backup/snapshot surface where one could be
  restored from."
- This was **not tested against a live erasure run** in this task (out of scope: no
  writes/deletes permitted). The behavior above is asserted from source code and public
  product documentation, not from watching an actual delete propagate.

---

## 4. Application Insights + Log Analytics retention

**Commands:**
```
az monitor log-analytics workspace show \
  --resource-group rg-azurechat-val1 --workspace-name law-azurechat-val1

az monitor app-insights component show \
  --app appi-azurechat-val1 --resource-group rg-azurechat-val1
```

**Result (verified live, 2026-07-31):**
- `law-azurechat-val1`: `retentionInDays: 30`, `publicNetworkAccessForIngestion: Enabled`,
  `publicNetworkAccessForQuery: Enabled`.
- `appi-azurechat-val1`: `retentionInDays: 30`, `ingestionMode: LogAnalytics`,
  `workspaceResourceId` points at `law-azurechat-val1` — **confirmed workspace-based**,
  so App Insights inherits the workspace's 30-day retention rather than having an
  independent one.

**What could be in there, and whether erasure obligations attach:** `safe-logger.ts`
(`src/features/common/services/safe-logger.ts`) is the sole logging entry point for
anything touching chat/document/tenant code, and its `SafeLogFields` type is a closed
allow-list — `requestId`, `tenantSlug`, `chatThreadId` (opaque nanoid), `userId` (SHA-256
hash of email, never the raw address), `statusCode`, `count`, `durationMs`, `eventType`,
`errorCode`, `complexity`, `deploymentUsed`, token counts. There is **no field for raw
prompt text, document content, filenames, or display names** — the type signature makes
passing free-form content through impossible without a distinct code change. Per
`security-gdpr-review.md` M-2, this allow-list is not universally honored today: a small
number of call sites (`chat-document-service.ts`, `ai-search.ts`) still use raw
`console.error`/`console.log` outside `safeLog`, which is a real gap the security review
already flags, separate from this task. Within `safeLog`'s own design, the only
identifying field that reaches App Insights/LAW is a **SHA-256 hash** of the user's
email — a pseudonymized identifier, not directly personal data in the same sense as an
email address or name, though under a strict GDPR reading a stable hashed identifier can
still constitute personal data if it can be linked back to the subject (which it can,
via the `UserAccount.hashedId` field). **Conclusion:** genuine Art. 17 erasure
obligations plausibly attach to the hashed-id telemetry, but the exposure is narrow
(hash + counts + status codes, no content) and time-bounded to the fixed 30-day platform
retention — see the Retained-records classification below for why this is treated as an
acceptable legitimate-interest/security-log retention rather than something the erasure
flow needs to purge.

---

## 5. Audit + deployment logs

**GDPR erasure audit record** (`GdprErasureAuditRecord`, `gdpr-erasure-service.ts:138-162`)
— read directly from source, schema-enforced by Zod:
```
{ id, type: "GDPR_ERASURE_AUDIT", userId: tenantSlug, tenantSlug,
  performedByHashedId,   // SHA-256 hash of the admin who triggered erasure
  subjectHashedId,       // SHA-256 hash of the erased subject
  timestamp,
  counts: { chatThreads, chatMessages, ..., userAccount: "anonymized"|"error" } }
```
Confirmed: **no raw email, name, or content field exists in this schema** — only two
hashes and integer counts. This record is deliberately excluded from per-subject erasure
(`TENANT_LEVEL_EXCLUDED_DOCUMENT_TYPES.gdprErasureAudit`, `gdpr-erasure-service.ts:118-123`)
because the audit trail for an erasure event must outlive the erasure it records — this
is a legitimate retained record (Art. 17(3)(b)/(e) — compliance with a legal obligation /
establishment of legal claims), and its content-minimal shape means retaining it carries
essentially no residual privacy exposure for the erased subject.

**Azure Activity Log** — queried live:
```
az monitor activity-log list --resource-group rg-azurechat-val1 --offset 7d
```
returned 50 real control-plane events (deployments, `publishxml` actions, etc.) for the
past 7 days, confirming the log is populated and queryable. Azure Activity Log's platform
retention is a fixed, non-configurable **90 days** (documented Azure platform behavior;
not independently re-derivable from a single 7-day query, since proving the exact cutoff
would require waiting 90 days — accepted as a well-established platform constant, not
re-verified against this specific subscription). It is a control-plane record (who
deployed what resource, when) — not user chat content — and is immutable/tamper-evident
by design, making it a legitimate security/audit record under the same Art. 17(3)(b)/(e)
basis as the GDPR erasure audit record.

**GitHub Actions run logs** — checked live:
```
gh api repos/PixelflowDK/SalesPrism/actions/runs   # total_count: 0
```
Confirmed via CLAUDE.md and this query: `provision-customer.yml` does not exist yet and
no workflow runs have ever executed in this repository, so there is currently **nothing
to retain** on this axis. GitHub's default Actions log/artifact retention for this
repository (public, personal-account-owned — `gh api repos/PixelflowDK/SalesPrism` shows
`"visibility": "public"`) is GitHub's platform default; personal (non-organization)
repositories cannot configure a custom retention policy the way an organization can, so
whatever GitHub's current public-repo default is will apply once real runs exist. This
was **not independently confirmed against a live run** because none exist — see "Not
verified" below.

---

## 6. Model-provider logging / abuse monitoring (ZDR)

**Command:**
```
az cognitiveservices account show --name oai-azurechat-val1 --resource-group rg-azurechat-val1
```

**Result (verified live, 2026-07-31):** `properties.raiMonitorConfig: null` (no override
configured — the account runs Microsoft's default Responsible AI / abuse-monitoring
behavior), `disableLocalAuth: null` (not explicitly set — consistent with
`security-gdpr-review.md` H-1's finding that this is unset), `publicNetworkAccess:
Disabled`, `kind: OpenAI`, `sku.name: S0`.

**ZDR parameter is dead code, not "ready but off."** `infra/main.bicep:42` declares
`param enableZeroDataRetention bool = false`, matching SAD §6.5's description almost
verbatim ("Bicep-templaten inkluderer en ZDR-parameter fra dag 1, standard `false`").
However, tracing the module call (`infra/main.bicep:133-148`, the `openAiModule` block)
shows **`enableZeroDataRetention` is never passed as a parameter to `modules/
openai.bicep`**, and `modules/openai.bicep` itself has no parameter of that name and no
`raiMonitorConfig`/abuse-monitoring property set anywhere in its resource body
(`grep -n "enableZeroDataRetention\|abuse\|raiMonitor" infra/main.bicep infra/modules/
openai.bicep` returns only the unused declaration). **This is worse than the SAD
implies:** the SAD frames the parameter as the on/off switch for an Enterprise Security
Add-on that becomes real "process: apply to Microsoft → approval 1–4 weeks →
re-deployment with `true`." As implemented, flipping that parameter to `true` today would
change nothing — there is no code path connecting it to any Azure OpenAI property. ZDR
has also never been applied for real: it requires a Microsoft Limited Access Program
approval that is an out-of-band, account-level grant, and nothing in this repo, this
subscription's resource state, or `docs/architecture-decisions/` shows that approval was
ever requested or granted.

**Real retention consequence:** with ZDR neither wired up nor approved, `oai-
azurechat-val1` is on Microsoft's standard Azure OpenAI abuse-monitoring path — prompts
and completions sent to this deployment can be retained by Microsoft for up to **30
days** for abuse-detection purposes, per Microsoft's public Azure OpenAI data-privacy
documentation (not independently re-verifiable from this subscription's side — Microsoft
does not expose a customer-facing query of what it has retained). This means: **every
chat prompt/completion processed through this Azure OpenAI resource is a genuine,
uncontrolled-by-us copy of personal/business data that can persist for up to 30 days on
Microsoft's side, regardless of anything `EraseDataSubject` does.** This is a materially
different and more serious retention path than any of the app-controlled stores above,
and should be disclosed to customers' legal teams as such rather than glossed over via
the "ZDR-ready" framing in SAD §6.5/§16.3.

**Addendum 2026-08-11 (SR-006, resolved):** the dead `enableZeroDataRetention` parameter described
above has been removed from `infra/main.bicep` and both `.bicepparam` files, and SAD §6.5/§16.3
corrected to stop implying a deployable ZDR control exists. This addendum does not change any
finding above — the 30-day Microsoft-side abuse-monitoring retention this section documents is
still live and unmitigated on every `oai-azurechat-{slug}` account, including `oai-azurechat-val1`.
See `docs/known-limitations.md` (SR-006) and `docs/deployment-record.md` for the change record.

---

## 7. Expected end-to-end delay — per store

| Store | Active-data deletion | Last-copy expiry after erasure request | Verified how |
|---|---|---|---|
| Cosmos DB (chat/config containers) | Immediate (`EraseDataSubject`, hard delete by id) | Up to **~8h** (periodic backup retention) after the last backup that captured the pre-erasure state, which itself was taken ≤4h before erasure | `az cosmosdb show` — live |
| Cosmos DB — `ActivityEvent` only | Immediate (hard delete) **and** independently TTL-capped at 30 days even if never explicitly erased | Same ~8h backup tail as above | Source read (`cosmos-retention.ts`) + `az cosmosdb show` |
| Blob storage (`images/` container) | Immediate (`eraseBlobsForThreads`, per-thread-prefix delete) — but see the SR-007 update below | **[UPDATED 2026-08-11 — SR-007] 7 days.** Blob soft delete is now enabled (`deleteRetentionPolicy: { enabled: true, days: 7 }`, deployed live to `stval136sepgklp44gk`) — a hard delete triggered by `eraseBlobsForThreads` is therefore NOT immediately final; Azure retains a recoverable copy of the "deleted" blob for up to 7 days before permanent purge. This is a deliberate trade — see `docs/known-limitations.md` and SAD §22.1 for the accidental-deletion-protection rationale — but it means the true erasure completion for an image blob is "immediate app-level delete + up to 7 days before Azure's own copy is gone," not instant. The 90-day lifecycle backstop (for un-erased images) is confirmed deployed (`lastModifiedTime: 2026-08-10T14:39:02Z`). Container soft delete and blob versioning remain disabled. | `az storage account blob-service-properties show`, `management-policy show` — live, re-verified 2026-08-11 |
| Azure AI Search index | Immediate, per Microsoft's documented consistency model (delete visible to queries right away) | Not independently observable; no customer-facing backup/snapshot surface exists per SAD §22.2 | Source read + public product docs — **not independently verified against a live delete** |
| App Insights / Log Analytics | N/A — nothing is deleted per-subject; hashed id + counts only | Fixed **30 days** from ingestion (platform retention) | `az monitor log-analytics workspace show`, `az monitor app-insights component show` — live |
| GDPR erasure audit record | N/A — deliberately retained forever (legal/audit record) | Never expires by design | Source read (Zod schema, `TENANT_LEVEL_EXCLUDED_DOCUMENT_TYPES`) |
| Azure Activity Log | N/A — control-plane record, not subject data | Fixed **90 days** (Azure platform constant) | `az monitor activity-log list` (populated, live) + documented Azure platform behavior |
| GitHub Actions run logs | N/A — no runs exist yet | GitHub public-repo default (no runs to test) | `gh api .../actions/runs` — live, `total_count: 0` |
| Azure OpenAI abuse-monitoring copy | Not controllable by this app at all | Up to **30 days** (Microsoft standard retention; ZDR not wired up, not approved) | `az cognitiveservices account show` — live (`raiMonitorConfig: null`) + Bicep trace showing the ZDR param is unused |
| `UserAccount` document | Anonymized, not deleted (by design) | N/A — retained indefinitely as an anonymized audit-adjacent record | Source read (`anonymizeUserAccount`) |

---

## Four-way classification, per store

### Immediately deleted active data
- Cosmos `HistoryContainer`: `CHAT_THREAD`, `MESSAGE`, `CHAT_DOCUMENT`, `CHAT_CITATION` documents owned by the subject — hard-deleted by id.
- Cosmos `ConfigContainer`: `CUSTOMER_ENTITY`, `MEETING_BRIEF`, `ACTIVITY_EVENT` documents owned by the subject — hard-deleted by id.
- Azure AI Search index documents tagged with the subject's hashed id (vector + full extracted text + identity tag, deleted together as one document).
- Blob storage: image blobs under the subject's own chat-thread prefixes.

### Anonymized (retained record, PII stripped)
- `UserAccount` document — survives with: `id`/`hashedId` (needed for the doc's own Cosmos identity and admin lookups), `tenantSlug`, `status: "disabled"`, `tags: {}` (cleared), `lastLoginAt: null` (cleared). **Stripped:** `displayName` → literal `"Erased user"`; `email` → synthetic `erased-<first16ofHash>@erased.invalid`. Known gap (see `docs/known-limitations.md`): `status: "disabled"` is not enforced at authentication, so a re-authenticating SSO user's `EnsureUserOnLogin` can re-populate `displayName`/`email` from the IdP on next login, reversing the anonymization, unless the IdP-side identity is separately handled.

### Retained security/legal records (with lawful basis)
- **GDPR erasure audit record** (`GDPR_ERASURE_AUDIT` documents) — contains only `performedByHashedId`, `subjectHashedId`, `timestamp`, and integer `counts`; no other PII. Retained indefinitely. Lawful basis: Art. 17(3)(b) (compliance with a legal obligation to demonstrate erasure occurred) and 17(3)(e) (establishment/defense of legal claims).
- **Azure Activity Log** — control-plane record of who deployed/changed what, when. Retained a fixed, non-configurable 90 days by Azure. Lawful basis: same as above; not user-content data.
- **Application Insights / Log Analytics telemetry** — hashed subject id, tenant slug, request metadata, status codes, durations, token counts; no prompt/response text, filenames, or display names by design (`safe-logger.ts`'s closed allow-list), modulo the M-2 gap already tracked in `security-gdpr-review.md` for a handful of non-`safeLog` call sites. Retained 30 days (workspace-inherited). Lawful basis: legitimate interest in operational/security monitoring, bounded by a short fixed retention.

### Inaccessible backup copies awaiting expiry
- **[SUPERSEDED 2026-08-11 — SR-007, see below] Cosmos periodic backups** — up to 2 backups retained, taken every 4 hours; a pre-erasure snapshot of a subject's data can persist in an existing backup for up to ~8 hours after the backup that captured it, i.e. up to roughly 12 hours worst case from the moment of erasure until the last relevant backup rolls off. Not self-service restorable by us or the customer — only via an Azure Support ticket, per SAD §22.1's own description of the standard tier.
- **[SUPERSEDED 2026-08-11 — SR-007, see below] Blob soft-delete/lifecycle** — currently **not applicable** on val1: soft delete and versioning are both disabled, so there is no soft-delete shadow window to await; and the 90-day lifecycle policy that would sweep un-erased images is in source code but **not yet deployed**.
- **Azure OpenAI abuse-monitoring copy** — up to 30 days, entirely on Microsoft's side, outside this app's or this repo's control, and not disclosed as such anywhere the SAD's ZDR framing implies it is a solved/optional concern. This is the single largest undisclosed retention exposure found in this review. (Still true as of 2026-08-11 — see the SR-006 addendum in §6 above; this exposure was not addressed by SR-007 and remains open.)

**Independent re-verification 2026-08-11 (deploy/verify pass, azure-infra-engineer, ~12:00–15:00 UTC):**
performed as part of deploying the already-authored SR-007/H-2/H-5/SR-010 blocker work (commit
`a36519c`). Re-ran the live queries fresh rather than trusting the addendum below:
```
az cosmosdb show -g rg-azurechat-val1 -n cosmos-azurechat-val1
  → backupPolicy.type: "Continuous", continuousModeProperties.tier: "Continuous30Days"
az storage account blob-service-properties show -g rg-azurechat-val1 --account-name stval136sepgklp44gk
  → deleteRetentionPolicy: { enabled: true, days: 7, allowPermanentDelete: false }
az storage account management-policy show -g rg-azurechat-val1 --account-name stval136sepgklp44gk
  → policy.rules[].name: ["delete-images-after-90-days"]
```
Both confirmed **still** live and matching `infra/modules/cosmos-db.bicep` /
`infra/modules/storage.bicep` exactly (`enableContinuousBackup` default `true`,
`blobSoftDeleteRetentionDays` default `7`). No Bicep redeploy of the Cosmos or Storage modules was
performed in this pass — a subscription-scoped `what-if` (`az deployment sub what-if` against
`infra/main.bicep` + `environments/validation.bicepparam`) showed the Cosmos account resource would
be a full-object PUT that also resets several **unrelated** live-only properties not declared in the
template (`analyticalStorageConfiguration`, `defaultIdentity`, `diagnosticLogSettings`,
`enableMaterializedViews`, `enablePerRegionPerPartitionAutoscale`, `enablePriorityBasedExecution`,
`minimalTlsVersion`, `sqlEndpoint`) — per this repo's own SR-002 lesson embedded in
`cosmos-db.bicep`'s header comment. Since the desired backup/soft-delete state was already live and
correct, redeploying purely to "confirm" it would have been a net-negative action (real risk of
resetting properties this task was not authorized to touch, for zero benefit). See
`docs/deployment-record.md` (2026-08-11 addendum) for the full what-if trace and rationale.
**Retention window stated plainly, once more, for this addendum's own record:** an image blob
"deleted" by `eraseBlobsForThreads` remains recoverable by Azure for up to **7 days**
(`blobSoftDeleteRetentionDays`) before permanent purge; a pre-erasure Cosmos snapshot remains
restorable via self-service point-in-time restore for up to **30 days** (`Continuous30Days`). Both
figures are unchanged from the 2026-08-11 addendum below — this entry only records that they were
independently re-confirmed live, not re-derived or altered.

**Addendum 2026-08-11 (SR-007) — both superseded rows above, corrected:**
- **Cosmos backups:** `cosmos-azurechat-val1` was migrated live to Continuous30Days (see §1
  addendum above). A pre-erasure snapshot of a subject's data is now only recoverable via a
  30-day self-service point-in-time restore window (down from the prior *un*-erasable-without-a-
  Support-ticket periodic backup), and the RPO for any given restore point is near-continuous
  rather than a fixed 4-hour cadence. This is a materially shorter, more precisely bounded, and
  self-service-triggerable exposure than the row above described — but it is not zero: a
  30-day-old backup copy of erased data remains theoretically restorable by an operator with
  access to the Cosmos account for the full 30-day continuous-backup window, same as any
  point-in-time restore capability.
- **Blob soft-delete/lifecycle:** no longer "not applicable." Soft delete is now enabled
  (7-day window) and the 90-day lifecycle policy is confirmed deployed. An erased image blob is
  recoverable by Azure for up to 7 days post-erasure before permanent purge — see §2's addendum
  above for the full statement of this tradeoff.

---

## Not verified (explicit)

- **Azure AI Search's internal, non-queryable delete propagation** (write-ahead logs,
  segment merge/compaction timing) — not observable via any customer-facing Azure AI
  Search API; asserted from public product documentation only, not from watching a live
  delete.
- **A real end-to-end erasure run against `rg-azurechat-val1` or any live tenant** — this
  task was read-only against Azure (no writes/deletes permitted) and there is no seeded
  test tenant with real chat/document data in `rg-azurechat-val1` today to erase and
  observe. All timing claims for Cosmos/backup/AI-Search/blob behavior are derived from
  the live *configuration* (`az ... show`), not from a live *erasure event*.
- **The exact 90-day Azure Activity Log cutoff and GitHub Actions' current public-repo
  default retention window** — both are documented platform defaults; neither was
  re-derived experimentally (the former would require a 90-day wait, and the latter has
  zero real workflow runs to inspect — `total_count: 0`).
- **Whether Microsoft's Azure OpenAI abuse-monitoring pipeline has, in practice, ever
  retained any specific prompt/completion from this account for the full 30 days** —
  Microsoft does not expose a customer-facing query surface for this; the 30-day figure
  is Microsoft's own published policy statement, not something independently
  measurable from the subscription side.
- **GitHub's organization-vs-personal-account Actions retention configuration options**
  in detail — `gh api repos/PixelflowDK/SalesPrism/actions/permissions` confirms Actions
  are enabled and unrestricted, but no API call in this session surfaced a numeric
  retention-days value for this specific personal-account repository (`gh api .../
  actions/permissions/workflow` does not return one; personal-account repos have no
  settings UI equivalent to an org's `actions/permissions` retention field that this
  session could query).
- **RBAC role actually granted to the GitHub OIDC identity for `provision-customer.yml`**
  — out of scope for this task and already flagged as unverified in
  `docs/reviews/security-gdpr-review.md`; irrelevant to retention directly but relevant to
  whether a future compromised pipeline run could itself become a retention/exfiltration
  vector. Not re-checked here.

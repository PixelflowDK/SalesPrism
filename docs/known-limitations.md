# Known Limitations

**Purpose:** Track known gaps, deferred work, and constraints that are accepted for now but should be revisited. Not a bug tracker — durable, structural limitations only.

| Date added | Limitation | Impact | Revisit when |
|---|---|---|---|
| 2026-07-30 | Professional (gpt-5.4) and Enterprise (gpt-5.5) model tiers are quota-gated in DataZoneStandard westeurope — only gpt-5.4-mini is currently granted | New customers can only be provisioned on the Standard tier until quota is approved | Quota increase request approved (see `azure-quotas` skill) |
| 2026-07-30 | Embeddings run on text-embedding-3-small; text-embedding-3-large is quota-gated | Slightly lower retrieval quality vs. target embedding model | text-embedding-3-large quota granted (ADR-001) |
| 2026-07-30 | Entra External ID CIAM tenant not yet created | Username/Password auth method (Auth Method B, SAD §8.3) cannot be provisioned yet — only Entra ID SSO available | CIAM tenant provisioned in Phase D |
| 2026-07-30 | `DESIGN.md` regeneration pending | Design tokens in code may not yet reflect the finalized Copper Fjord/Nordic Moss/Fjord Teal/Warm Stone palette from the SAD decisions log | DESIGN.md regenerated from Stitch project "Sales Coaching Conversation View" |

## Provisioning pipeline (2026-07-30)
- Key Vault cert escrow from GitHub-hosted runners cannot reach private-endpoint-only customer Key Vaults; PFX bind works directly, escrow is best-effort with warning. Revisit if CLOUDFLARE_ORIGIN_CA_KEY is provided (options: deploymentScripts in VNet, scoped temporary exception, self-hosted runner).
- TenantTheme/moduleConfig Cosmos seeding not done by the workflow (Cosmos is private-endpoint-only): the application seeds defaults on first boot per tenant (Phase D wiring).
- Origin CA TLS step pending an Origin CA key secret; until then Cloudflare proxy + App Service hostname serves traffic (Full, not Full-strict).
- Subscription-scope deployments have no --mode flag; Complete mode is impossible by construction (satisfies the Incremental-only rule).
- Pipeline SP has NO Azure RBAC yet: az role assignment create is classifier-blocked in auto mode — user must run the two documented commands (see chat 2026-07-30 / resume.md) before provision-customer.yml can deploy. Validation deployment unaffected (runs under operator session).
- Extensions/plugins execution deferred to Phase C Sprint 3 (SAD-sanctioned): attach/detach UI persists but attached extensions are not executed during chat; DALL-E image extension and /api/document proxy removed.
- NEXTAUTH_URL is a *.azurewebsites.net placeholder until the DNS job binds the real hostname — provision workflow should update it post-DNS-bind (follow-up, Stage 3d/Phase D auth wiring).

## GDPR data-lifecycle (2026-07-31) — SAD §32.1/§32.3 vs. implementation

Implemented this pass: `src/features/admin/gdpr-erasure-service.ts` (`EraseDataSubject`),
`DELETE /api/admin/users/[userId]/gdpr-erase`, `src/features/common/services/cosmos-retention.ts`
(Cosmos TTL), and a 90-day blob lifecycle policy in `infra/modules/storage.bicep`. See
`docs/requirements-traceability.md`'s Art. 15/17/20 rows for what's covered. Remaining gaps:

- **Entra External ID account deletion (SAD §32.3 step 3) is not implemented.** No Microsoft
  Graph client exists anywhere in this repo (grep-verified), and `src/features/auth-page/` was
  read-only for this task. More importantly, this step may not even be the right design: for
  `authMethod: "entra-sso"` tenants, the actual identity lives in the CUSTOMER's own Entra ID
  tenant, not one InsightCast has Graph permissions against — automating deletion of a customer's
  employee account from this app would be both technically unavailable and organizationally
  questionable (that's the customer's IT department's call, not ours to automate). Recommend
  revising SAD §32.3 to scope this step to `authMethod: "username-password"` (Entra External ID
  CIAM) tenants only, once the CIAM tenant referenced elsewhere in this file exists, and treating
  `entra-sso` tenants' erasure as "everything this app controls is erased/anonymized; the
  customer's own IT disables the SSO identity" — discuss with Kristjan before SAD sign-off.
- **Cosmos containers are created out-of-band, not by this repo's Bicep**
  (`infra/modules/cosmos-db.bicep` provisions only the account — verified no
  `createDatabaseIfNotExists`/`createContainerIfNotExists` call exists in `src/` either). TTL is
  therefore applied by the running app itself (`EnsureContainerRetentionPolicies`, called once per
  process from `app/(authenticated)/layout.tsx`, same "seed on first boot" idiom as
  `EnsureTenantTheme`), not by Bicep. If the App Service's Cosmos SQL role is ever narrowed below
  "Cosmos DB Built-in Data Contributor" (`00000000-0000-0000-0000-000000000002`, the role actually
  assigned per `infra/modules/rbac.bicep`), container-property writes will fail; the app logs and
  continues (best-effort, never blocks the app shell) — ops must then apply `defaultTtl` manually,
  e.g.: `az cosmosdb sql container update --account-name <cosmos> --database-name chat --name
  history --resource-group <rg> --ttl 7776000` (and `--ttl -1` for the `config` container, with
  per-document `ttl` left to the application as already implemented).
- **AI Search has no native per-document TTL.** The 90-day retention SAD §32.1 promises for
  uploaded-document content is fully covered for erasure-ON-REQUEST (`DeleteDocumentsByUser`,
  Art. 17), but there is no scheduled/automatic 90-day sweep of index documents whose owning user
  never triggers an erasure request. Achieving that would require a separate scheduled job (Azure
  Function/Logic App timer) that is out of scope for this task (no such infra exists in this repo)
  — revisit as a Phase C Sprint follow-up if the SAD's blanket-90-day guarantee (not just
  on-request erasure) needs to hold for AI Search specifically.
- **Uploaded document (PDF/DOCX/XLSX) *content* is never written to blob storage in this
  codebase** — `chat-document-service.ts` streams the file directly to Document Intelligence in
  memory; only the extracted/chunked text is persisted, to the AI Search index. SAD §32.1's "Blob
  TTL" for uploaded documents therefore has no blob-storage counterpart to apply to today; the
  90-day blob lifecycle policy added to `infra/modules/storage.bicep` targets the `images/`
  prefix (chat multimodal image uploads), the only blob container this app actually writes to.
- **`UserAccount.status` is not enforced at authentication.** `SetUserStatus`/anonymization can
  set `status: "disabled"`, but no session/auth check gates login on it (verified: no `status ===`
  check anywhere in `auth-page/`). A subject who re-authenticates via SSO after erasure will have
  `EnsureUserOnLogin` re-sync `displayName`/`email` from the IdP onto the same (now anonymized)
  `UserAccount` document, reversing the anonymization on next login, unless the IdP-side identity
  is also disabled (see the Entra deletion point above) or this enforcement gap is closed. The
  enforcement point would naturally live in `auth-page/`, which was read-only for this task —
  pre-existing gap, not introduced by the erasure feature, but the erasure feature's effectiveness
  depends on it being closed eventually.
- **Backups/snapshots are outside this flow's control**, as with any cloud data store's live-API-
  vs-backup distinction: Cosmos continuous/periodic backup retention and any AI Search platform-
  level snapshots are not purged by `EraseDataSubject` — only live, queryable data is.

## Security remediations blocking production (2026-07-30)
- **SR-001** — Entra client secret lives in App Service settings, not Key Vault. Accepted for validation only. Production requires Key Vault reference via managed identity + VNet integration. See docs/security-decision-log.md.
- **SR-002** — `disableLocalAuth` unset on Azure OpenAI + Document Intelligence accounts (pre-existing gap). Production requires MI-verified real calls, then `disableLocalAuth: true`, then re-test.
- Production deployment is prohibited until both pass. Validation work is not blocked.

## Authentication verification (2026-07-31)
- **Interactive sign-in on the rotated credential is NOT verified.** The authorization-redirect leg is verified automatically (correct tenant/client_id/redirect_uri/scopes — see docs/reviews/val1-login-flow-verification.md Part A). The token exchange, session creation, authenticated page access, logout and re-login legs require entering real credentials at Microsoft's sign-in page, which the agent does not do. Part B of that document is a checklist pending the operator.
- The 4 authenticated E2E journeys remain explicitly skipped for the same root cause: no test identity exists. Decision recorded: do NOT introduce a weaker authentication provider (e.g. a credentials provider) to make these tests pass — that would trade a real production security property for test convenience. Options when ready: a dedicated Entra test user in the tenant, or a test-only provider gated so it cannot be enabled in production.

## GDPR retention-chain verification (2026-07-31) — live Azure findings beyond active-data erasure

Full writeup: `docs/gdpr-erasure-evidence.md`. `EraseDataSubject`/`cosmos-retention.ts` (commit
`d6fe070`) correctly handle active, queryable data. Verifying the rest of the retention chain
against the live `rg-azurechat-val1` stack (`az` read-only queries, subscription "Azure
subscription 1") surfaced gaps not previously documented:

- **Cosmos DB is on default Periodic backup (4h interval / 8h retention), not the Continuous
  Backup the SAD "decided" on.** SAD §22.1 states Continuous Backup (`Continuous30Days`) via a
  `enableContinuousBackup bool = true` Bicep parameter was the accepted decision for Phase B
  onward. That parameter does not exist anywhere in this repo, and `infra/modules/cosmos-db.bicep`
  sets no `backupPolicy` at all — confirmed live via `az cosmosdb show --name
  cosmos-azurechat-val1 --resource-group rg-azurechat-val1` (`"type": "Periodic",
  "backupIntervalInMinutes": 240, "backupRetentionIntervalInHours": 8`). An erased Cosmos document
  can still be recovered from an existing periodic backup for up to ~8-12 hours after erasure,
  and only via an Azure Support ticket (no self-service point-in-time restore, unlike what
  Continuous Backup would have provided). Revisit: add `enableContinuousBackup`/`backupPolicy` to
  `cosmos-db.bicep` per the SAD's own decision, or formally revise §22.1 to describe what's
  actually deployed.
- **The `enableZeroDataRetention` Bicep parameter (`infra/main.bicep:42`) is dead code.** It is
  declared with the SAD-described default (`false`) but is never passed into
  `modules/openai.bicep`'s module call, and that module has no parameter or resource property
  connected to it (verified by tracing `infra/main.bicep`'s `openAiModule` block and grepping
  `modules/openai.bicep` for any ZDR/abuse-monitoring property). Flipping the parameter to `true`
  today would do nothing. Live `oai-azurechat-val1` has `raiMonitorConfig: null` (Microsoft default
  abuse-monitoring, unmodified) confirmed via `az cognitiveservices account show`. Real consequence:
  every prompt/completion sent through this account can be retained by Microsoft for up to 30 days
  for abuse-monitoring, with no code path in this repo to change that even after a hypothetical ZDR
  approval. Revisit: either wire the parameter to a real ZDR-relevant property once Microsoft's
  Limited Access Program approval is actually pursued, or remove the parameter so it stops implying
  a control that doesn't exist.
- **The commit-`d6fe070` blob lifecycle policy (`infra/modules/storage.bicep`,
  `delete-images-after-90-days`) is not yet deployed to `rg-azurechat-val1`.** Confirmed via
  `az storage account management-policy show --account-name stval136sepgklp44gk
  --resource-group rg-azurechat-val1` → `ManagementPolicyNotFound`. The last `deploy-storage-val1`
  run (`az deployment group list -g rg-azurechat-val1`) completed 2026-07-30T16:34:41Z, before
  `d6fe070` was committed (2026-07-31T09:11:30+02:00). Revisit: re-run the storage deployment for
  val1 (and any other already-provisioned customer stack) to pick up the lifecycle policy —
  otherwise the 90-day backstop for un-erased chat-image blobs silently does not apply anywhere yet.
- **Blob soft delete, container soft delete, and blob versioning are all disabled** on the live
  `stval136sepgklp44gk` account (`deleteRetentionPolicy.enabled: false`,
  `containerDeleteRetentionPolicy: null`, `isVersioningEnabled: null` — `az storage account
  blob-service-properties show`). Not necessarily wrong (it means a hard delete is genuinely final,
  which is erasure-friendly), but it was never a deliberate documented decision and means there is
  currently zero accidental-deletion recovery window for this storage account. Revisit if/when a
  storage-resilience pass happens.
- **Azure OpenAI abuse-monitoring (up to 30 days, Microsoft-side) is the single largest
  undisclosed retention exposure found in this review.** It is outside `EraseDataSubject`'s reach
  entirely, is not mentioned in `docs/gdpr-erasure-evidence.md`'s predecessor documents as a live
  risk, and the SAD's ZDR framing (§6.5/§16.3 — "Bicep-parameter klar fra dag 1") reads as though
  the control is one flag away from ready, which the dead-parameter finding above shows is not
  true. Recommend this be surfaced explicitly to any customer whose legal team reviews the erasure
  story, not left implicit.

## SR-005 dependency CVEs — residual (2026-08-10)
7 remain (2 HIGH, 5 MODERATE) after clearing both CRITICALs. Full per-CVE reachability evidence: docs/reviews/sr-005-cve-triage.md.
- All residual findings are **build-time only** except `nanoid`, where a vendored copy IS on the server render path but the vulnerable code path (custom generator with size 0) is never invoked.
- **Not fixable today**: `@ducanh2912/next-pwa` is already at its newest release (10.2.9) and the advisory covers >=10.2.7 — no patched version exists; `next` pins its own `postcss@8.4.31` and an override is rejected as conflicting with a direct dependency.
- **Auth path is clean**: the next-auth CRITICAL and the jws HMAC advisory are both resolved. `getToken()` in middleware was treated as runtime-reachable throughout.
- Re-check triggers are listed at the end of the triage doc. These verdicts are evidence-bound and must be re-run on any dependency change, or if CSS/workbox config ever becomes attacker-influenceable.

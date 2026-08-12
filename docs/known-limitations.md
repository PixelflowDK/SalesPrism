# Known Limitations

**Purpose:** Track known gaps, deferred work, and constraints that are accepted for now but should be revisited. Not a bug tracker — durable, structural limitations only.

| Date added | Limitation | Impact | Revisit when |
|---|---|---|---|
| 2026-08-10 | ADR-003 identity migration (`hashValue(email)` → `${tenantId}:${oid}`) is not backward-compatible; any pre-existing document keyed by the old email hash is unreachable under the new scheme | None for val1 today (interactive login has never been run — see "Authentication verification" below — so no real user-owned Cosmos/AI-Search documents exist to strand). Would matter on a tenant with real history. | Never, for val1 pre-migration data (accepted, see "ADR-003 identity migration" section below). If this scheme is ever changed again on a tenant with real user data, a real migration script is required — see that section for what it would need. |
| ~~2026-07-30~~ **RETRACTED 2026-08-12** | ~~Professional (gpt-5.4) and Enterprise (gpt-5.5) tiers are quota-gated~~ — **this was never true, or stopped being true without anyone re-checking.** `az cognitiveservices usage list -l westeurope` shows gpt-5.4 limit 300 and gpt-5.5 limit 333, both at 0 usage. | None. The tiers were unavailable only because the deployments were never created, not because Microsoft withheld quota. Two weeks of architecture discussion were shaped by a claim nobody re-tested. | Done — see `infra/scripts/finish-acceptance.sh` step 2. |
| 2026-07-30 (revised 2026-08-12) | Embeddings run on text-embedding-3-small. `text-embedding-3-large` is **available** (limit 1000, unused) — the earlier "quota-gated" reason was wrong. | Slightly lower retrieval quality than the ADR-001 target. | Deliberately deferred: the two models have different dimensions, so switching invalidates every indexed document and requires a full reindex. That is a migration with a backfill plan, not a config flip, and belongs in its own change. |
| 2026-07-30 | Entra External ID CIAM tenant not yet created | Username/Password auth method (Auth Method B, SAD §8.3) cannot be provisioned yet — only Entra ID SSO available | CIAM tenant provisioned in Phase D |
| 2026-07-30 | `DESIGN.md` regeneration pending | Design tokens in code may not yet reflect the finalized Copper Fjord/Nordic Moss/Fjord Teal/Warm Stone palette from the SAD decisions log | DESIGN.md regenerated from Stitch project "Sales Coaching Conversation View" |
| 2026-08-11 | **H-2 val1 exception (deliberate, dated):** `restrictIngressToCloudflare` is set `false` for val1 in `infra/environments/validation.bicepparam` — val1 runs unproxied (Cloudflare DNS-only) with an App Service-managed cert, not the Cloudflare Origin Certificate + Full-strict setup SAD §7.2 describes, so val1's own traffic doesn't arrive via Cloudflare edge IPs. Enabling the restriction on val1 today would 502 the live site. | `app-azurechat-val1.azurewebsites.net` remains fully open to the internet, bypassing Cloudflare's WAF/DDoS/rate-limiting entirely — acceptable for an internal validation stack with no real customer data, not acceptable for any production customer. | val1 (or its successor) is re-proxied through Cloudflare with an Origin Certificate per SAD §7.2 — see `cloudflare-dns-engineer` agent for that work. Every production customer defaults to `restrictIngressToCloudflare: true` already and must never override it. |
| 2026-08-11 (updated 2026-08-11 18:10) | **H-3 Azure Policy: definitions DEPLOYED and assigned in AUDIT-ONLY mode.** Superseded the earlier "authored but not assigned" entry. All three custom definitions (deny non-EU region, deny Azure OpenAI GlobalStandard, require standard tags) plus the `sales-prism-guardrails` initiative are now deployed to "Azure subscription 1", and the initiative is assigned at subscription scope with `--enforcement-mode DoNotEnforce` — verified via `az policy assignment list`. | Audit-only means the policies **evaluate and report compliance but deny nothing**. So SAD §16.2's "hård gardering" claim is now half-true rather than false: drift becomes visible, but a deployment violating a guardrail still succeeds. Enforcement remains, in practice, the `@allowed()` Bicep decorators — which a one-line PR can still remove. Chosen deliberately: an audit-only assignment cannot break any existing or in-flight deployment and is reversible with one delete, whereas subscription-wide deny has real blast radius across resources this project does not own. | Kristjan reviews `az policy state list --policy-set-definition sales-prism-guardrails` for false positives (see the tag policy's NIC-resource caveat — Azure creates NICs implicitly and they will not carry the standard tags), then re-runs `az policy assignment create` with `--enforcement-mode Default`. That single flip is all that remains of H-3. |
| 2026-08-11 | **H-3 public-network-access policy not implemented.** SAD §16.2 also claims a policy blocks public network access on AI services "by default" — out of scope for this pass (task specified exactly three definitions: region, GlobalStandard, tags). `publicNetworkAccess: 'Disabled'` is enforced only as a Bicep property today, verified set on all AI/data resources but not policy-backstopped. | Same class of risk as the other three findings, just not yet closed. | A fourth `infra/policy/` definition using the verified alias `Microsoft.CognitiveServices/accounts/publicNetworkAccess` (and equivalents for Cosmos/Storage/Search/Key Vault), added in a dedicated follow-up pass. |
| 2026-08-11 | **H-5 HTTP 5xx alert depends on SR-010 telemetry, which was uncommitted at deploy time.** `alert-http5xx-val1` (`Microsoft.Insights/scheduledQueryRules`, deployed live to val1) queries Application Insights' `requests` table — verified via `git status` at the time of this deployment that `src/instrumentation.ts` (the OpenTelemetry/Azure Monitor SDK wiring that would populate that table) exists in the working tree but is **uncommitted**, so it was not part of any deployed build as of this alert's creation. | The alert resource exists and is enabled, but has no data to evaluate until SR-010 is committed, deployed, and actually emitting request telemetry. Do not treat "alert exists" as "alert is proven to fire correctly." | SR-010 is committed and deployed to val1; re-verify by generating a deliberate 5xx (or checking `requests` table population) and confirming the alert's query returns real data. |
| 2026-08-11 | **H-5 Cosmos "RU/s" and Cost "150%/day" alerts are documented interpretations, not literal implementations.** No Azure Monitor metric named "RU/s" exists on Cosmos DB (verified via `az monitor metrics list-definitions`) — implemented as a count of `TotalRequests` with `StatusCode=429` instead. No "Daily" `timeGrain` exists on `Microsoft.Consumption/budgets` (Monthly/Quarterly/Annually/BillingMonth/BillingQuarter/BillingAnnual only) — implemented as a Monthly budget with a 150%-of-baseline notification instead of a true daily-anomaly detector. | Both alerts are real, deployed, and will fire — just not on the exact literal metric the SAD's wording implies. A reviewer comparing SAD §31.2 wording to the deployed resource type should not conclude either is "wrong" without reading `infra/modules/alerts.bicep`'s comments first. | A true daily-level cost anomaly detector is wanted: configure Azure Cost Management's native Anomaly Alert feature (subscription/billing-account scope, portal/API-configured — not a per-resource-group Bicep resource) as a separate, deliberate follow-up. |
| 2026-08-11 | **H-2 SCM/Kudu hardening deferred.** `modules/app-service.bicep` deliberately does NOT restrict the SCM/Kudu deployment endpoint (`*.scm.azurewebsites.net`) to Cloudflare IPs — Cloudflare doesn't proxy that hostname, so doing so would break `az webapp deploy` and the future `provision-customer.yml` GitHub Actions pipeline, not just tighten security. `scmIpSecurityRestrictionsUseMain` is explicitly set `false` (matches prior/current live behavior — verified via `az webapp config show` before deploying). | SCM/Kudu remains open to the internet for every customer, including production. | A dedicated pass adds GitHub Actions' published IP ranges (large, rotate more often than Cloudflare's) as an SCM allow-list, per the SAD decisions-log's stated target state — track as a separate ticket, do not silently reuse the Cloudflare list. |

| 2026-08-12 | **Tenant is Entra ID Free — no licenses.** Verified: `GET /v1.0/subscribedSkus` returns an empty list. | Two SR-008 emergency-access criteria are unreachable at any effort: (a) Conditional Access requires P1, so no CA policy can exist and the "exclude break-glass accounts" criterion is vacuous; (b) Entra sign-in log export to Log Analytics requires P1, so `alert-breakglass-signin` is **INERT** — the diagnostic setting persists and reports SignInLogs enabled, but zero rows arrived in 40 minutes across several real sign-ins, while the same workspace took 4,797 AppDependencies. An alert is not monitoring until data has been seen reaching its query. | Entra ID P1 is purchased (a commercial decision, ~€6/user/month). The alert and diagnostic setting are left in place deliberately — both are correct and begin working the moment a licence lands. |
| 2026-08-12 | **H-3 assignment is still `DoNotEnforce`, and that is a production gate — not optional hardening.** SAD §16.2 makes the EU-data-boundary guarantee explicitly conditional: "forudsat operatøren gennemfører assignment-trinnet ovenfor". That guarantee backs GDPR requirements R1 and R2. | Until the assignment is `Default`, enforcement is only the `@allowed()` Bicep decorators, which SAD §16.2 itself says "en simpel PR der fjerner en decorator ville have kunnet omgå fuldstændigt". The policies evaluate and report; they deny nothing. | Blocked twice over, both by design: SAD §16.2 assigns the flip to Kristjan explicitly ("ikke af en agent"), and the agent execution-policy classifier blocks the call. Analysis is complete and clean — 107/107 compliant, no unrelated resource in deny scope. See SD-011. |

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

- **RESOLVED 2026-08-11 (SR-007, Cosmos backup half).** Cosmos DB was on the RP's default
  Periodic backup (4h interval / 8h retention), not the Continuous Backup SAD §22.1 "decided" on
  via a never-implemented `enableContinuousBackup bool = true` parameter — confirmed live before
  the fix via `az cosmosdb show` (`"type": "Periodic", "backupIntervalInMinutes": 240,
  "backupRetentionIntervalInHours": 8`). Fixed: `enableContinuousBackup` (default `true`) now
  exists in `infra/main.bicep` and `infra/modules/cosmos-db.bicep`, wired to
  `cosmosAccount.properties.backupPolicy`. `cosmos-azurechat-val1` was migrated live 2026-08-11 via
  `az cosmosdb update --backup-policy-type Continuous --continuous-tier Continuous30Days` — verified
  in-place (`Modify`, not delete/recreate) via `az deployment group what-if` beforehand, and
  confirmed via before/after `az cosmosdb show` diff that `disableLocalAuth`,
  `publicNetworkAccess`, `enableAutomaticFailover`, private endpoints, tags, and region were all
  unchanged. **This migration is one-way** — Continuous cannot be moved back to Periodic on this
  account. See `docs/deployment-record.md` (2026-08-11) for the full evidence and SAD §22.1/§22.3
  for the corrected text.
- **RESOLVED 2026-08-11 (SR-006).** The dead `enableZeroDataRetention` Bicep parameter (was
  `infra/main.bicep:42`) has been **removed** — decision (b) of the two options this entry
  originally offered, because Azure OpenAI ZDR has no ARM/Bicep-settable property in any API
  version this repo uses; it is an account-level grant Microsoft applies out-of-band after a
  Limited Access Program approval (1-4 weeks), so there was nothing to "wire" — only a dead
  parameter to remove. Removed from `infra/main.bicep`, `infra/environments/example.bicepparam`,
  `infra/environments/validation.bicepparam`; SAD §6.5/§16.3 and the decisions-log rows corrected
  to stop claiming ZDR is "Bicep-parameter klar fra dag 1." `infra/main.bicep` now carries a dated
  comment explaining what would need to be true before any ZDR-related code is re-added. Live
  `oai-azurechat-val1` is unaffected by this change (the parameter never controlled anything) and
  still has `raiMonitorConfig: null` (Microsoft standard abuse-monitoring, up to 30 days) — this is
  the actual, undiminished retention exposure and remains open, tracked as a real (not code)
  limitation below. No customer has ever been sold ZDR; no re-verification against a live approved
  account is possible until one exists. See `docs/gdpr-erasure-evidence.md` §6 for the original
  trace and `docs/deployment-record.md` (2026-08-11 section) for the change record.
- **Azure OpenAI abuse-monitoring retention (up to 30 days, Microsoft-side) remains real and
  unmitigated for every customer account today.** This is not a bug in this repo — there is
  currently no product mechanism (Bicep, app code, or otherwise) that changes it short of an actual
  Microsoft ZDR approval per customer account. Disclose this explicitly to any customer whose legal
  team reviews the erasure/retention story (see the entry below and `docs/gdpr-erasure-evidence.md`).
  Revisit: if/when a customer's ZDR Limited Access Program application is submitted and approved,
  confirm via `az cognitiveservices account show` what (if anything) changes on the resource, and
  document that as the first real, verified ZDR implementation — do not pre-emptively add Bicep for
  it before an approval exists to test against.
- **RESOLVED (confirmed 2026-08-11, deployed sometime between 2026-07-31 and 2026-08-10 — exact
  date/actor not tracked here).** The commit-`d6fe070` blob lifecycle policy
  (`infra/modules/storage.bicep`, `delete-images-after-90-days`) was previously not deployed to
  `rg-azurechat-val1` (`ManagementPolicyNotFound` as of 2026-07-31). Re-checked live 2026-08-11 as
  part of SR-007: `az storage account management-policy show --account-name stval136sepgklp44gk
  --resource-group rg-azurechat-val1` now returns the policy, `lastModifiedTime:
  2026-08-10T14:39:02Z`, matching committed source exactly (`delete-images-after-90-days`, prefix
  `images/`, 90 days). No action needed — already closed by the time this SR-007 pass started.
- **RESOLVED 2026-08-11 (SR-007, blob soft delete half).** Blob soft delete, container soft
  delete, and blob versioning were all disabled on the live `stval136sepgklp44gk` account
  (`deleteRetentionPolicy.enabled: false`, `containerDeleteRetentionPolicy: null`,
  `isVersioningEnabled: null`), never a deliberate documented decision. Fixed: `modules/
  storage.bicep` now sets `deleteRetentionPolicy: { enabled: true, days: 7 }` explicitly via a new
  `blobSoftDeleteRetentionDays` param (default 7), deployed live to `stval136sepgklp44gk`
  2026-08-11 (`az deployment group what-if` confirmed an isolated, additive `Modify` — no other
  storage-account property touched — before deploying; post-deploy `az storage account
  blob-service-properties show` confirms `enabled: true, days: 7`). **GDPR tension, stated
  explicitly:** `EraseDataSubject` (`eraseBlobsForThreads`) hard-deletes image blobs on request,
  but with soft delete on, Azure retains a recoverable copy for this 7-day window before the blob
  is permanently purged — see `docs/gdpr-erasure-evidence.md` for the updated retention-chain
  statement. **Container soft delete and blob versioning remain deliberately disabled** — out of
  this fix's scope; revisit only as part of a dedicated storage-resilience pass, not silently.
- **Azure OpenAI abuse-monitoring (up to 30 days, Microsoft-side) is the single largest
  undisclosed retention exposure found in this review.** It is outside `EraseDataSubject`'s reach
  entirely, is not mentioned in `docs/gdpr-erasure-evidence.md`'s predecessor documents as a live
  risk, and the SAD's ZDR framing (§6.5/§16.3 — "Bicep-parameter klar fra dag 1") reads as though
  the control is one flag away from ready, which the dead-parameter finding above shows is not
  true. Recommend this be surfaced explicitly to any customer whose legal team reviews the erasure
  story, not left implicit.

## ADR-003 identity migration (2026-08-10) — email-hash → canonical oid, no data migration performed

`docs/architecture-decisions/ADR-003-canonical-identity.md` replaces ownership derived from
`hashValue(email-fallback-chain)` with the verified Entra `${tenantId}:${oid}` claim pair
end-to-end: chat threads/messages/documents/citations, AI Search RAG filters, customer entities,
meeting briefs, admin authorization (`ADMIN_OBJECT_IDS` replaces `ADMIN_EMAIL_ADDRESS`), activity
events, and GDPR erasure targeting. Every `*HashedId` field was renamed (`ownerHashedId`→`ownerId`,
`actorHashedId`→`actorId`, `UserAccount.hashedId`→`canonicalUserId`, etc.) so no field name still
implies a hash of anything.

**No data-migration script was written, deliberately.** Per the ADR's own rationale and
`docs/reviews/val1-login-flow-verification.md` Part B (still pending the operator), the
interactive login flow has never been completed against val1 — there is no evidence any real
Cosmos document was ever written under the old `hashValue(email)` scheme (val1's Cosmos/AI Search
stores hold only synthetic seed/test fixtures from earlier validation stages, never a document
produced by an actual authenticated end-user session). Writing a migration script against data
that verifiably doesn't exist would be pure speculation, and the ADR explicitly identifies "now"
(before any real customer data exists) as the cheapest point this decision will ever have.

**Consequence, accepted:** any document that *does* happen to exist in val1 today keyed by an old
`hashValue(email)`-style value (partition key, `ownerId`/`actorId`/`canonicalUserId` field, or an
AI Search `user` filter value) is now unreachable through the app — the new canonical id a real
login produces will never match it. This is intentional, not a bug: preserving reachability would
mean keeping the broken "ownership can silently change between logins" scheme alive for exactly
the class of document the ADR exists to stop trusting.

**If this is ever needed on a tenant with real user data** (i.e., a customer goes live under the
old scheme before it can be replaced, or a similar identity-key change is made again later), a
real migration would need to, per tenant:

1. **Build the old→new id map.** For every user who has ever logged in, resolve their historical
   `hashValue(email)` value(s) — note the OLD scheme itself was unstable (`profile.email ||
   profile.preferred_username`), so a single user could have MULTIPLE old hash values on file if
   their effective claim ever changed between logins; all of them must map to the SAME new
   `${tenantId}:${oid}`.
2. **Rewrite Cosmos partition keys and owner fields.** `HistoryContainer` documents
   (`ChatThreadModel`/`ChatMessageModel`/`ChatDocumentModel`/`ChatCitationModel`) are partitioned
   on `userId` itself — Cosmos does not support an in-place partition-key rewrite, so this is a
   read-old/write-new-under-new-partition-key/delete-old operation per document, not a field
   update. `ConfigContainer` documents (`CustomerEntity.ownerId`, `MeetingBriefDocument.ownerId`,
   `ActivityEvent.actorId`) are partitioned on `tenantSlug` (unaffected) with the owner as a
   regular field, so those are a simpler field-value rewrite.
3. **Re-index every AI Search document.** `AzureSearchDocumentIndex.user` (the RAG authorization
   filter value, `azure-ai-search.ts`) must be rewritten per the same map — index-document `user`
   values cannot be bulk-renamed via the Search REST API; this is delete-and-re-upload (the
   `embedding` vector can be reused as-is, only the identity field changes) or a full
   re-embed-and-reindex if simpler to operate.
4. **Reconcile `UserAccount` directory docs.** `user-service.ts`'s `EnsureUserOnLogin` already
   handles ONE piece of this going forward (adopting an admin-pre-provisioned "invite by email"
   doc on first real login — see that file's `findPendingInviteByEmail`), but a bulk migration of
   already-populated `UserAccount.canonicalUserId` values from old hashes to new canonical ids
   would still need a one-time script.
5. **Verify with the isolation test suite.** `customer-entity-service.test.ts`,
   `meeting-brief-service.test.ts`, `chat-thread-service.test.ts`, and
   `gdpr-erasure-service.test.ts`'s cross-user/cross-tenant assertions are the regression backstop
   that a migration didn't cross-wire two users' data — run them (or tenant-specific equivalents)
   against a migration dry-run before any production cutover.

## SR-005 dependency CVEs — residual (2026-08-10)
7 remain (2 HIGH, 5 MODERATE) after clearing both CRITICALs. Full per-CVE reachability evidence: docs/reviews/sr-005-cve-triage.md.
- All residual findings are **build-time only** except `nanoid`, where a vendored copy IS on the server render path but the vulnerable code path (custom generator with size 0) is never invoked.
- **Not fixable today**: `@ducanh2912/next-pwa` is already at its newest release (10.2.9) and the advisory covers >=10.2.7 — no patched version exists; `next` pins its own `postcss@8.4.31` and an override is rejected as conflicting with a direct dependency.
- **Auth path is clean**: the next-auth CRITICAL and the jws HMAC advisory are both resolved. `getToken()` in middleware was treated as runtime-reachable throughout.
- Re-check triggers are listed at the end of the triage doc. These verdicts are evidence-bound and must be re-run on any dependency change, or if CSS/workbox config ever becomes attacker-influenceable.

## Readiness claims — historical correction (2026-08-10)

**What the earlier val1 checks actually proved.** Between 2026-07-30 and 2026-08-10 the validation environment was described as "live and verified end-to-end". That was wrong and is corrected here permanently.

`HTTP 200` on the root URL, a valid TLS certificate, and `/api/auth/providers` returning `azure-ad` proved exactly three things:
- **HTTP availability** — the App Service was running and reachable.
- **TLS** — the custom domain served a valid certificate.
- **Auth-provider configuration** — NextAuth was configured against the correct tenant and app registration.

They did **not** prove functional end-to-end readiness. Throughout that period the Cosmos `chat` database and its `history`/`config` containers did not exist (SR-009), so **no data-plane operation had ever succeeded** — every page load logged `theme.get-failed`. An environment can return HTTP 200 with its entire data layer absent; availability and functionality are different claims and were conflated.

**Current status after SR-009 (commit 0ea8363):**
- PROVEN: schema exists with correct partition keys and TTLs (ARM-verified); the unauthenticated theme/config path performs real managed-identity reads/writes through the private endpoint — errors present before the fix, absent after, with live log activity in the same window confirming logging was active.
- NOT YET PROVEN: every authenticated path — chat thread/message/document/citation CRUD, customer entities, meeting briefs, persona/prompt persistence, activity events, GDPR erasure against real data, and item-level TTL behaviour. These require a real Entra session (Part B).

**val1 must not be described as end-to-end functional until SR-009 and a real authenticated data-plane journey (Part B) both pass.** Availability, TLS and auth configuration are green; functional readiness is not yet established.

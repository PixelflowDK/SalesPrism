Reading additional input from stdin...
OpenAI Codex v0.146.0
--------
workdir: /Users/hugosson/workspace/SalesPrism
model: gpt-5.4
provider: openai
approval: never
sandbox: read-only
reasoning effort: high
reasoning summaries: none
session id: 019fb521-9899-7163-8c8b-ed9767dce03e
--------
user
Adversarial security + GDPR review, round 2, of the SalesPrism repo (current directory). Round 1 findings were fixed; do NOT re-report them. Review the NEW surface area added since: src/features/sales-coach/** (customer entity service, extraction, meeting briefs, persona classification, context injection, structured output), src/features/admin/** (user/group/activity services, admin routes, CSV export), src/features/onboarding/**, src/features/help/**, src/app/(authenticated)/api/speech/** (transcribe + synthesize proxy routes), src/features/common/services/{azure-speech.ts,audio-validation.ts,safe-logger.ts}, src/features/chat-page/chat-services/model-router.ts, src/middleware.ts, and src/features/theme/**.

Hunt specifically for: (1) cross-user or cross-tenant data access — customer entities and meeting briefs are PER-SELLER private data; verify every query filters on BOTH tenantSlug and the owning seller's hashed id, and that no admin route can read another tenant; (2) authorization gaps — routes reachable without auth, admin routes not enforcing isAdmin server-side, IDOR on /api/sales-coach/meeting-briefs/[id] and /customers/[id]; (3) the speech proxy as an abuse surface — unauthenticated upload, size/duration bypass, SSRF, resource exhaustion, cost amplification; (4) PII leakage into logs or telemetry (safe-logger's allow-list, activity events, error paths); (5) prompt-injection paths that survive the document-evidence envelope, especially extraction and persona classification running over untrusted chat content in onFinish; (6) GDPR: data-subject deletion completeness across the NEW containers (customer entities, briefs, activity events, user accounts), retention/TTL gaps, and whether any new path sends data outside the EU; (7) CSV injection in the analytics export; (8) secrets or credentials reachable by client code.

For each finding: severity (CRITICAL/HIGH/MEDIUM/LOW), file:line, a concrete exploit scenario, and the minimal fix. Be specific and adversarial; no praise, no design restatement. End with VERDICT:APPROVED (no CRITICAL/HIGH) or VERDICT:REVISE plus the finding list.
codex
Reviewing the newly added surfaces you named with a security/GDPR lens. I’m starting by mapping the touched routes and services, then I’ll trace auth, tenant/seller scoping, logging, speech proxy constraints, and deletion/retention behavior end to end.
exec
/bin/zsh -lc "rg --files src/features/sales-coach src/features/admin src/features/onboarding src/features/help src/app/'(authenticated)'/api/speech src/features/common/services src/features/chat-page/chat-services src/features/theme src/middleware.ts" in /Users/hugosson/workspace/SalesPrism
 succeeded in 0ms:
src/middleware.ts
src/features/sales-coach/customer-entity-service.test.ts
src/features/help/help-panel.tsx
src/features/chat-page/chat-services/rag-tool.test.ts
src/features/onboarding/onboarding-modal.tsx
src/features/theme/tenant-theme.ts
src/features/sales-coach/extraction-service.ts
src/features/sales-coach/actor-context.ts
src/features/sales-coach/structured-output.ts
src/features/sales-coach/models.ts
src/features/admin/activity-service.test.ts
src/features/admin/group-service.ts
src/features/common/services/ai-search.ts
src/features/common/services/safe-logger.test.ts
src/features/common/services/safe-logger.ts
src/features/common/services/audio-validation.test.ts
src/features/common/services/audio-validation.ts
src/features/common/services/azure-ai.ts
src/features/common/services/azure-speech.test.ts
src/features/common/services/document-intelligence.ts
src/features/common/services/cosmos.ts
src/features/common/services/key-vault.ts
src/features/common/services/azure-storage.ts
src/features/common/services/azure-speech.ts
src/features/help/help-store.ts
src/features/onboarding/onboarding-questions.ts
src/features/onboarding/onboarding-actions.ts
src/features/onboarding/starter-prompt-store.ts
src/features/onboarding/onboarding-controller.tsx
src/features/onboarding/onboarding-store.ts
src/features/admin/user-service.ts
src/features/admin/activity-service.ts
src/features/theme/tenant-resolver.ts
src/features/theme/theme-config.ts
src/features/theme/tenant-resolver.test.ts
src/features/admin/admin-guard.ts
src/features/theme/contrast.test.ts
src/features/theme/tenant-theme-style.tsx
src/features/theme/contrast.ts
src/features/theme/theme-provider.tsx
src/features/sales-coach/customer-entity-service.ts
src/features/sales-coach/intent-detection.test.ts
src/features/sales-coach/meeting-prep-tool.ts
src/features/sales-coach/context-injection.test.ts
src/features/sales-coach/stt-cleanup.test.ts
src/features/chat-page/chat-services/images-api.ts
src/features/chat-page/chat-services/chat-thread-service.test.ts
src/features/chat-page/chat-services/chat-image-service.ts
src/features/chat-page/chat-services/chat-thread-service.ts
src/features/chat-page/chat-services/citation-service.ts
src/features/chat-page/chat-services/chat-handler.ts
src/features/chat-page/chat-services/models.ts
src/features/chat-page/chat-services/chat-message-service.ts
src/app/(authenticated)/api/speech/synthesize/route.ts
src/features/sales-coach/context-injection.ts
src/features/sales-coach/stt-cleanup.ts
src/features/sales-coach/intent-detection.ts
src/features/sales-coach/meeting-brief-service.ts
src/features/chat-page/chat-services/chat-message-mapper.ts
src/features/chat-page/chat-services/chat-document-service.ts
src/features/chat-page/chat-services/model-router.ts
src/features/chat-page/chat-services/chat-message-mapper.test.ts
src/features/chat-page/chat-services/rag-tool.ts
src/features/sales-coach/actions/customer-actions.ts
src/features/admin/actions/group-actions.ts
src/features/admin/actions/user-actions.ts
src/app/(authenticated)/api/speech/cleanup/route.ts
src/app/(authenticated)/api/speech/transcribe/route.ts
src/features/admin/components/stat-card.tsx
src/features/chat-page/chat-services/azure-ai-search/azure-ai-search.ts
src/features/sales-coach/components/meeting-brief.tsx
src/features/admin/components/admin-nav.tsx
src/features/sales-coach/components/persona-card.tsx
src/features/sales-coach/components/meeting-brief-embed.tsx

exec
/bin/zsh -lc 'git status --short' in /Users/hugosson/workspace/SalesPrism
 succeeded in 0ms:
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-4fL3TMAC' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-qanDa7Qm' (errno=Operation not permitted)
 M .gitignore
?? .claude/skills/
?? docs/reviews/codex-review-2-features.md
?? skills-lock.json

exec
/bin/zsh -lc 'git log --oneline --decorate -n 20' in /Users/hugosson/workspace/SalesPrism
 succeeded in 0ms:
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-oij0cEM0' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-fY4xUKOX' (errno=Operation not permitted)
bb28ab5 (HEAD -> develop, origin/develop) fix(a11y): SR-004 — WCAG AA contrast for body text (measured, regression-tested)
84add51 fix(security): close middleware auth gap on /customers, /briefs, /persona, /prompt
65fc889 chore: gitignore PWA build output (sw.js/workbox-*) + session state
10d3fd8 test: vitest suite (108 tests) + fix two security bugs it found
7c8e433 docs: security decision log — SD-001 accepted, SR-001/SR-002 remediations block production
084b974 docs: val1 application deployed + auth wired — login shell live, azure-ad provider serving
12638bb feat(infra): Azure AI Speech resource for STT (backlog F-02)
1f884cc feat(sales-coach): Phase E — F-01..F-04 core differentiating features
fc1a71a docs: handoff checkpoint — Fable to Opus lead, in-flight workers, next actions
5763ce8 docs: r4 validation deployment Succeeded — 8/8 verification PASS; DNS+TLS live on val1-sales360.pixelflow.dk
f05d994 feat(admin): Phase D — customer admin, user directory, analytics + Codex F5/F7 fixes
54ec0c3 feat(infra): ADR-002 — Cosmos EU region fallback (swedencentral) for capacity-gated subscriptions
8bde670 fix(infra+ci): resolve Codex review HIGH findings F1-F4 + MEDIUM F6
cd5e565 feat(ui): Stage 4 — Coach 360 design system, tenant theming, thread authz fix
686ff70 docs: Codex adversarial review #1 (infra+pipeline+chat) — VERDICT REVISE, 5 HIGH / 2 MEDIUM
04e0172 docs: deployment record — westeurope Cosmos capacity constraint, cosmosRegion reroute, pending user actions
8daee24 fix(infra): explicit isZoneRedundant=false on Cosmos location (SAD s34.5 single-region MVP)
9c24e46 feat(chat): Phase C Sprint 1 — full Vercel AI SDK v6 service migration
002bf04 feat(ci): provision-customer.yml — OIDC, gated environments, DNS-guarded Cloudflare automation
c9112e6 docs: regenerate DESIGN.md from Stitch project + finalized token system

codex
I’ve mapped the relevant files. Next I’m reading the route handlers and backing services together so I can verify whether the auth boundary actually survives into the Cosmos queries, not just the UI layer.
exec
/bin/zsh -lc "rg -n \"export (async )?(function|const) (GET|POST|PUT|PATCH|DELETE)|isAdmin|requireUser|tenantSlug|sellerHashedId|customerId|meeting-brief|brief|persona|transcribe|synthesize|cleanup|csv|safeLogger|console\\.|track|activity|delete|ttl|retention|DefaultAzureCredential|apiKey|AZURE_OPENAI_API_KEY\" src/app src/features/sales-coach src/features/admin src/features/onboarding src/features/help src/features/common/services src/features/chat-page/chat-services/model-router.ts src/middleware.ts src/features/theme" in /Users/hugosson/workspace/SalesPrism
 succeeded in 0ms:
src/middleware.ts:7:// /customers, /briefs, /persona and /prompt without an auth check, so an
src/middleware.ts:16:  "/persona",
src/middleware.ts:20:  "/briefs",
src/middleware.ts:41:      if (!token.isAdmin) {
src/middleware.ts:65:    "/briefs/:path*",
src/middleware.ts:66:    "/briefs",
src/middleware.ts:67:    "/persona/:path*",
src/features/theme/tenant-theme.ts:25: * itself (`tenantSlug`) rather than an end-user id, purely so the
src/features/theme/tenant-theme.ts:72:  /** Cosmos partition key — set to `tenantSlug`, see module doc above. */
src/features/theme/tenant-theme.ts:74:  tenantSlug: z.string(),
src/features/theme/tenant-theme.ts:87:const tenantThemeDocId = (tenantSlug: string) => `tenant-theme-${tenantSlug}`;
src/features/theme/tenant-theme.ts:89:const buildDefaultTenantTheme = (tenantSlug: string): TenantTheme => {
src/features/theme/tenant-theme.ts:95:    id: tenantThemeDocId(tenantSlug),
src/features/theme/tenant-theme.ts:97:    userId: tenantSlug,
src/features/theme/tenant-theme.ts:98:    tenantSlug,
src/features/theme/tenant-theme.ts:117:  tenantSlug: string
src/features/theme/tenant-theme.ts:121:      query: "SELECT * FROM root r WHERE r.type=@type AND r.tenantSlug=@tenantSlug",
src/features/theme/tenant-theme.ts:124:        { name: "@tenantSlug", value: tenantSlug },
src/features/theme/tenant-theme.ts:129:      .items.query<TenantTheme>(querySpec, { partitionKey: tenantSlug })
src/features/theme/tenant-theme.ts:135:        errors: [{ message: `TenantTheme not found for slug: ${tenantSlug}` }],
src/features/theme/tenant-theme.ts:152:    safeLog.error("theme.get-failed", { tenantSlug });
src/features/theme/tenant-theme.ts:170:  tenantSlug: string
src/features/theme/tenant-theme.ts:172:  const existing = await GetTenantTheme(tenantSlug);
src/features/theme/tenant-theme.ts:182:  const seeded = buildDefaultTenantTheme(tenantSlug);
src/features/theme/tenant-theme.ts:191:    safeLog.error("theme.seed-failed", { tenantSlug });
src/features/theme/tenant-theme.ts:202:      return await GetTenantTheme(tenantSlug);
src/features/theme/tenant-theme.ts:205:    safeLog.error("theme.seed-failed", { tenantSlug, statusCode: status });
src/features/theme/contrast.test.ts:83:    // features/ui/button.tsx default variant + meeting-brief.tsx's "Open
src/features/theme/contrast.test.ts:84:    // saved brief" link both fill with --color-primary-text, not raw
src/features/admin/activity-service.test.ts:2:import { csvEscape } from "./activity-service";
src/features/admin/activity-service.test.ts:4:// `csvEscape` is the only pure, side-effect-free helper exported (directly
src/features/admin/activity-service.test.ts:6:// export in activity-service.ts) from the admin package's tag/CSV logic.
src/features/admin/activity-service.test.ts:9:// rename/delete logic is inlined into the I/O function body, not split out
src/features/admin/activity-service.test.ts:13:describe("csvEscape", () => {
src/features/admin/activity-service.test.ts:15:    expect(csvEscape("Alice")).toBe("Alice");
src/features/admin/activity-service.test.ts:16:    expect(csvEscape(42)).toBe("42");
src/features/admin/activity-service.test.ts:20:    expect(csvEscape(null)).toBe("");
src/features/admin/activity-service.test.ts:24:    expect(csvEscape("Doe, Jane")).toBe('"Doe, Jane"');
src/features/admin/activity-service.test.ts:28:    expect(csvEscape('She said "hi"')).toBe('"She said ""hi"""');
src/features/admin/activity-service.test.ts:32:    expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
src/features/admin/activity-service.test.ts:36:    expect(csvEscape("plain-value_123")).toBe("plain-value_123");
src/app/globals.css:241: * actually-rendered element is `<h3 class="font-semibold tracking-tight
src/app/globals.css:257: * /meeting-brief.tsx's text-lg font-bold AI Response Block section
src/features/sales-coach/customer-entity-service.test.ts:11:// guarantee: every query MUST include both tenantSlug and ownerHashedId).
src/features/sales-coach/customer-entity-service.test.ts:62:  personaType: null,
src/features/sales-coach/customer-entity-service.test.ts:136:// here and asserted to include BOTH tenantSlug and ownerHashedId in what it
src/features/sales-coach/customer-entity-service.test.ts:139:describe("customer-entity-service isolation: every query scopes by tenantSlug AND ownerHashedId", () => {
src/features/sales-coach/customer-entity-service.test.ts:152:  it("FindCustomerEntitiesForOwner: query params include tenantSlug and ownerHashedId, partitionKey is tenantSlug", async () => {
src/features/sales-coach/customer-entity-service.test.ts:163:      expect.arrayContaining(["@tenantSlug", "@ownerHashedId"])
src/features/sales-coach/customer-entity-service.test.ts:165:    expect(paramValues["@tenantSlug"]).toBe(TENANT);
src/features/sales-coach/customer-entity-service.test.ts:171:    expect(querySpec.query).toMatch(/r\.tenantSlug=@tenantSlug/);
src/features/sales-coach/customer-entity-service.test.ts:175:  it("FindCustomerEntityByName: query params include tenantSlug and ownerHashedId", async () => {
src/features/sales-coach/customer-entity-service.test.ts:182:    expect(paramValues["@tenantSlug"]).toBe(TENANT);
src/features/sales-coach/customer-entity-service.test.ts:187:  it("FindCustomerEntityById: re-checks tenantSlug AND ownerHashedId on the resource even though the read is already partition-scoped", async () => {
src/features/sales-coach/customer-entity-service.test.ts:191:        tenantSlug: TENANT,
src/features/sales-coach/customer-entity-service.test.ts:200:    // (tenantSlug), is NOT enough — a different seller in the SAME tenant
src/features/sales-coach/customer-entity-service.test.ts:208:  it("FindCustomerEntityById: returns the resource only when both tenantSlug and ownerHashedId match", async () => {
src/features/sales-coach/customer-entity-service.test.ts:215:        tenantSlug: TENANT,
src/features/sales-coach/customer-entity-service.test.ts:233:  it("CreateCustomerEntity: persists the given tenantSlug and ownerHashedId on the created document", async () => {
src/features/sales-coach/customer-entity-service.test.ts:237:      tenantSlug: TENANT,
src/features/sales-coach/customer-entity-service.test.ts:244:    expect(createdDoc.tenantSlug).toBe(TENANT);
src/features/sales-coach/customer-entity-service.test.ts:252:        tenantSlug: TENANT,
src/features/common/services/ai-search.ts:6:import { DefaultAzureCredential } from "@azure/identity";
src/features/common/services/ai-search.ts:9:// DefaultAzureCredential. No Azure AI Search API-key environment variable
src/features/common/services/ai-search.ts:17:console.log("Configuration parameters:", {
src/features/common/services/ai-search.ts:25:  const credential = new DefaultAzureCredential();
src/features/common/services/ai-search.ts:26:  if (debug) console.log("Credential obtained via DefaultAzureCredential");
src/features/common/services/ai-search.ts:31:  console.log("Creating Azure AI Search Client Instance");
src/features/common/services/ai-search.ts:40:  console.log("Search Client created:", searchClient);
src/features/common/services/ai-search.ts:45:  console.log("Creating Azure AI Search Index Client Instance");
src/features/common/services/ai-search.ts:53:  console.log("Search Index Client created:", searchClient);
src/features/common/services/ai-search.ts:58:  console.log("Creating Azure AI Search Indexer Client Instance");
src/features/common/services/ai-search.ts:66:  console.log("Search Indexer Client created:", client);
src/features/onboarding/onboarding-modal.tsx:32: *  1. Welcome (styled placeholder — deliberately no video, per brief).
src/features/onboarding/onboarding-modal.tsx:66:          <p className="font-mono text-xs uppercase tracking-[0.1em] text-muted-foreground">
src/features/onboarding/onboarding-modal.tsx:71:            {step === 1 && "A little about your world"}
src/features/onboarding/onboarding-modal.tsx:86:              <p className="font-mono text-xs uppercase tracking-[0.1em]">What {AI_NAME} does</p>
src/features/onboarding/onboarding-modal.tsx:89:              <li>Prepares you for meetings with structured, 2nd Position briefs.</li>
src/features/onboarding/onboarding-modal.tsx:173:      <span className="font-mono text-xs uppercase tracking-[0.1em] text-muted-foreground">
src/features/onboarding/onboarding-modal.tsx:186:      <span className="font-mono text-xs uppercase tracking-[0.1em] text-muted-foreground">
src/features/onboarding/onboarding-modal.tsx:205:      <span className="font-mono text-xs uppercase tracking-[0.1em] text-muted-foreground">
src/features/help/help-panel.tsx:63:                    Mention a customer and ask for a meeting brief — {AI_NAME} builds opening questions,
src/features/help/help-panel.tsx:64:                    value-area themes and discovery questions by persona.
src/features/help/help-panel.tsx:99:                      <p className="font-mono text-xs uppercase tracking-[0.1em] text-primary-text">{key}</p>
src/features/help/help-panel.tsx:117:                  question="Can I reopen a meeting brief later?"
src/features/help/help-panel.tsx:118:                  answer="Yes — every saved brief is available under Briefs and reopens exactly as it was generated."
src/features/theme/tenant-resolver.ts:5: * SAD v2.7 §5.3 / Stage 4 brief: production tenants are addressed as
src/features/common/services/azure-speech.test.ts:7: * SDK result and this app's transcription outcome — see `transcribeAudio`
src/features/sales-coach/extraction-service.ts:35:  tenantSlug: string;
src/features/sales-coach/extraction-service.ts:57:        const persona = await classifyPersona({
src/features/sales-coach/extraction-service.ts:64:          name: persona.name,
src/features/sales-coach/extraction-service.ts:65:          title: persona.title,
src/features/sales-coach/extraction-service.ts:66:          personaType: persona.personaType,
src/features/sales-coach/extraction-service.ts:67:          primaryValueArea: persona.primaryValueArea,
src/features/sales-coach/extraction-service.ts:68:          secondaryValueArea: persona.secondaryValueArea,
src/features/sales-coach/extraction-service.ts:69:          knownTriggers: persona.knownTriggers,
src/features/sales-coach/extraction-service.ts:70:          communicationTips: persona.communicationTips,
src/features/sales-coach/extraction-service.ts:71:          suggestedQuestions: persona.suggestedQuestions,
src/features/sales-coach/extraction-service.ts:75:        safeLog.error("sales-coach.extraction.persona-classify-failed", {
src/features/sales-coach/extraction-service.ts:76:          tenantSlug: input.tenantSlug,
src/features/sales-coach/extraction-service.ts:82:          personaType: null,
src/features/sales-coach/extraction-service.ts:94:      tenantSlug: input.tenantSlug,
src/features/sales-coach/extraction-service.ts:103:      safeLog.error("sales-coach.extraction.upsert-failed", { tenantSlug: input.tenantSlug });
src/features/sales-coach/extraction-service.ts:106:    safeLog.error("sales-coach.extraction.failed", { tenantSlug: input.tenantSlug });
src/features/admin/group-service.ts:19: * user has it, or (b) rename/delete a dimension across every user in one
src/features/admin/group-service.ts:20: * action. This document tracks the tenant's known dimension names
src/features/admin/group-service.ts:21: * explicitly, in the same `ConfigContainer` / tenantSlug-partition
src/features/admin/group-service.ts:29:  /** Cosmos partition key — set to `tenantSlug`. */
src/features/admin/group-service.ts:31:  tenantSlug: z.string(),
src/features/admin/group-service.ts:37:const tagDimensionsDocId = (tenantSlug: string) => `tag-dimensions-${tenantSlug}`;
src/features/admin/group-service.ts:40:  tenantSlug: string
src/features/admin/group-service.ts:44:      .item(tagDimensionsDocId(tenantSlug), tenantSlug)
src/features/admin/group-service.ts:51:          id: tagDimensionsDocId(tenantSlug),
src/features/admin/group-service.ts:53:          userId: tenantSlug,
src/features/admin/group-service.ts:54:          tenantSlug,
src/features/admin/group-service.ts:75:          id: tagDimensionsDocId(tenantSlug),
src/features/admin/group-service.ts:77:          userId: tenantSlug,
src/features/admin/group-service.ts:78:          tenantSlug,
src/features/admin/group-service.ts:84:    safeLog.error("admin.groups.get-failed", { tenantSlug });
src/features/admin/group-service.ts:90:  tenantSlug: string,
src/features/admin/group-service.ts:94:    id: tagDimensionsDocId(tenantSlug),
src/features/admin/group-service.ts:96:    userId: tenantSlug,
src/features/admin/group-service.ts:97:    tenantSlug,
src/features/admin/group-service.ts:110:  tenantSlug: string,
src/features/admin/group-service.ts:119:    const existing = await GetTagDimensions(tenantSlug);
src/features/admin/group-service.ts:122:    return await upsertDimensions(tenantSlug, [...existing.response.dimensions, trimmed]);
src/features/admin/group-service.ts:124:    safeLog.error("admin.groups.add-failed", { tenantSlug });
src/features/admin/group-service.ts:131:  tenantSlug: string,
src/features/admin/group-service.ts:141:    const existing = await GetTagDimensions(tenantSlug);
src/features/admin/group-service.ts:145:    const dimensionsResult = await upsertDimensions(tenantSlug, renamed);
src/features/admin/group-service.ts:148:    await rewriteTagKeyOnAllUsers(tenantSlug, oldName, trimmedNew);
src/features/admin/group-service.ts:151:    safeLog.error("admin.groups.rename-failed", { tenantSlug });
src/features/admin/group-service.ts:158:  tenantSlug: string,
src/features/admin/group-service.ts:162:    const existing = await GetTagDimensions(tenantSlug);
src/features/admin/group-service.ts:166:    const dimensionsResult = await upsertDimensions(tenantSlug, remaining);
src/features/admin/group-service.ts:169:    await rewriteTagKeyOnAllUsers(tenantSlug, name, null);
src/features/admin/group-service.ts:172:    safeLog.error("admin.groups.delete-failed", { tenantSlug });
src/features/admin/group-service.ts:173:    return { status: "ERROR", errors: [{ message: "Unable to delete tag dimension." }] };
src/features/admin/group-service.ts:178: * Renames (or, if `newKey` is `null`, deletes) a single tag key across
src/features/admin/group-service.ts:184:  tenantSlug: string,
src/features/admin/group-service.ts:188:  const usersResponse = await FindUsersForTenant(tenantSlug);
src/features/admin/group-service.ts:201:          safeLog.error("admin.groups.rewrite-user-tag-failed", { tenantSlug });
src/features/common/services/safe-logger.test.ts:35:      tenantSlug: "dsv",
src/features/common/services/safe-logger.test.ts:50:      tenantSlug: "dsv",
src/features/common/services/safe-logger.test.ts:65:    safeLog.warn("event", { tenantSlug: "dsv" });
src/features/common/services/safe-logger.test.ts:67:    expect(Object.keys(payload).sort()).toEqual(["code", "tenantSlug"].sort());
src/features/common/services/safe-logger.test.ts:85:      tenantSlug: "dsv",
src/features/common/services/safe-logger.test.ts:96:    expect(payload).toEqual({ code: "event", tenantSlug: "dsv" });
src/features/common/services/audio-validation.ts:5: * `/api/speech/transcribe` route runs BEFORE ever calling Azure Speech, so
src/features/common/services/audio-validation.ts:118: * The single validation gate `/api/speech/transcribe` runs before ever
src/app/layout.tsx:70:    const tenantSlug = resolveTenantSlug(requestHeaders.get("host"));
src/app/layout.tsx:71:    const result = await EnsureTenantTheme(tenantSlug);
src/features/common/services/document-intelligence.ts:2:import { DefaultAzureCredential } from "@azure/identity";
src/features/common/services/document-intelligence.ts:4:// Zero-secrets (CLAUDE.md / SAD R3): always DefaultAzureCredential.
src/features/common/services/document-intelligence.ts:10:  console.log("Document Intelligence Endpoint:", endpoint);
src/features/common/services/document-intelligence.ts:18:  const credential = new DefaultAzureCredential();
src/features/common/services/document-intelligence.ts:21:  if (debug) console.log("Document Analysis Client created:", client);
src/features/sales-coach/actor-context.ts:7: * Shared `{ tenantSlug, ownerHashedId }` resolution for every Sales Coach
src/features/sales-coach/actor-context.ts:10: * `isAdmin` check, since customers/briefs are per-seller data available to
src/features/sales-coach/actor-context.ts:14:  tenantSlug: string;
src/features/sales-coach/actor-context.ts:17:  const [tenantSlug, ownerHashedId] = await Promise.all([
src/features/sales-coach/actor-context.ts:21:  return { tenantSlug, ownerHashedId };
src/features/common/services/safe-logger.ts:6: * The chat handler previously did `console.error("...", error)` /
src/features/common/services/safe-logger.ts:7: * `console.error("...", errors)` with raw SDK error objects and
src/features/common/services/safe-logger.ts:10: * console.error/warn/info in production is customer telemetry — and those
src/features/common/services/safe-logger.ts:31:  tenantSlug: string;
src/features/common/services/safe-logger.ts:56:  "tenantSlug",
src/features/common/services/safe-logger.ts:86:  // other call site in the app should go through safeLog instead of console.*.
src/features/admin/actions/group-actions.ts:13:  const { tenantSlug } = await requireAdminContext();
src/features/admin/actions/group-actions.ts:17:  await AddTagDimension(tenantSlug, name);
src/features/admin/actions/group-actions.ts:25:  const { tenantSlug } = await requireAdminContext();
src/features/admin/actions/group-actions.ts:29:  await RenameTagDimension(tenantSlug, oldName, newName);
src/features/admin/actions/group-actions.ts:34:export const deleteTagDimensionAction = async (name: string): Promise<void> => {
src/features/admin/actions/group-actions.ts:35:  const { tenantSlug } = await requireAdminContext();
src/features/admin/actions/group-actions.ts:36:  await DeleteTagDimension(tenantSlug, name);
src/features/common/services/azure-ai.ts:4:import { DefaultAzureCredential, getBearerTokenProvider } from "@azure/identity";
src/features/common/services/azure-ai.ts:10:// DefaultAzureCredential (managed identity) only.
src/features/common/services/azure-ai.ts:48: * authenticated exclusively via DefaultAzureCredential (managed identity).
src/features/common/services/azure-ai.ts:55:  const credential = new DefaultAzureCredential();
src/features/theme/tenant-resolver.test.ts:43:      delete process.env.TENANT_SLUG;
src/features/theme/tenant-resolver.test.ts:50:    delete process.env.TENANT_SLUG;
src/features/theme/tenant-resolver.test.ts:74:    delete process.env.TENANT_SLUG;
src/features/theme/tenant-resolver.test.ts:79:      delete process.env.TENANT_SLUG;
src/features/theme/tenant-resolver.test.ts:149:      if (ORIGINAL === undefined) delete process.env.TENANT_SLUG;
src/features/common/services/cosmos.ts:2:import { DefaultAzureCredential } from "@azure/identity";
src/features/common/services/cosmos.ts:12:    return new DefaultAzureCredential();
src/features/common/services/cosmos.ts:31:  if (credential instanceof DefaultAzureCredential) {
src/app/(authenticated)/briefs/page.tsx:2:import { FindMeetingBriefsForOwner } from "@/features/sales-coach/meeting-brief-service";
src/app/(authenticated)/briefs/page.tsx:9: * F-01 — `/briefs` list route. "Brief kan gemmes og genåbnes" acceptance
src/app/(authenticated)/briefs/page.tsx:10: * criterion: every meeting brief the seller has generated (across all chat
src/app/(authenticated)/briefs/page.tsx:14:  const { tenantSlug, ownerHashedId } = await getSalesCoachActorContext();
src/app/(authenticated)/briefs/page.tsx:15:  const result = await FindMeetingBriefsForOwner(tenantSlug, ownerHashedId);
src/app/(authenticated)/briefs/page.tsx:21:  const briefs = result.response;
src/app/(authenticated)/briefs/page.tsx:26:        <p className="font-mono text-xs uppercase tracking-[0.1em] text-muted-foreground">Coach 360</p>
src/app/(authenticated)/briefs/page.tsx:27:        <h1 className="font-display text-2xl font-bold text-foreground">Meeting briefs</h1>
src/app/(authenticated)/briefs/page.tsx:29:          Every meeting-preparation brief you&apos;ve generated in chat — saved and reopenable anytime.
src/app/(authenticated)/briefs/page.tsx:33:      {briefs.length === 0 ? (
src/app/(authenticated)/briefs/page.tsx:35:          No meeting briefs yet. Ask Coach 360 to &ldquo;prepare me for a meeting&rdquo; to get started.
src/app/(authenticated)/briefs/page.tsx:39:          {briefs.map((doc) => (
src/app/(authenticated)/briefs/page.tsx:42:              href={`/briefs/${doc.id}`}
src/app/(authenticated)/briefs/page.tsx:46:                <p className="font-display text-lg font-bold text-foreground">{doc.brief.customerName}</p>
src/app/(authenticated)/briefs/page.tsx:47:                <p className="text-sm text-muted-foreground">{doc.brief.meetingTopic}</p>
src/features/common/services/azure-storage.ts:3:import { DefaultAzureCredential } from "@azure/identity";
src/features/common/services/azure-storage.ts:14:    return new BlobServiceClient(endpoint, new DefaultAzureCredential());
src/features/sales-coach/structured-output.ts:26: * DefaultAzureCredential — `azure-ai.ts` already enforces this, nothing
src/features/sales-coach/structured-output.ts:34:const MEETING_BRIEF_SYSTEM_PROMPT = `Du er en Sales Coach 360 mødeforberedelses-motor. Generér et struktureret møde-brief baseret udelukkende på den information sælgeren har givet.
src/features/sales-coach/structured-output.ts:44:- "discoveryQuestionsByPersona" skal give konkrete spørgsmål per nævnt/kendt persona-type.
src/features/sales-coach/structured-output.ts:53:  /** Optional known customer intel (F-03) to ground the brief in prior history instead of re-asking. */
src/features/sales-coach/structured-output.ts:134:  personaType: PersonaTypeSchema,
src/features/sales-coach/structured-output.ts:145:Gyldige persona-typer: ${Object.entries(PERSONA_TYPE_LABELS)
src/features/sales-coach/structured-output.ts:150:- Vælg "orgLevel" og "personaType" ud fra titel + kontekst (fx en IT-direktør er typisk "tactical", en CFO/CEO typisk "strategic").
src/features/sales-coach/structured-output.ts:152:- Gæt ikke på fakta der ikke er nævnt — men du MÅ udlede en rimelig persona-klassificering fra titel + kontekst, det er selve opgaven.`;
src/features/admin/activity-service.ts:17: * partitioned on `tenantSlug` (not on the acting user), so both the
src/features/admin/activity-service.ts:20: * aggregation, per the Stage 5a brief.
src/features/admin/activity-service.ts:45:  /** Cosmos partition key — set to `tenantSlug` (see module doc above). */
src/features/admin/activity-service.ts:47:  tenantSlug: z.string(),
src/features/admin/activity-service.ts:58:  tenantSlug: string,
src/features/admin/activity-service.ts:67:      userId: tenantSlug,
src/features/admin/activity-service.ts:68:      tenantSlug,
src/features/admin/activity-service.ts:76:    safeLog.error("admin.activity.record-failed", { tenantSlug, eventType });
src/features/admin/activity-service.ts:81:  tenantSlug: string;
src/features/admin/activity-service.ts:88:  recordEvent(props.tenantSlug, props.actorHashedId, "prompt", {
src/features/admin/activity-service.ts:96:  tenantSlug: string;
src/features/admin/activity-service.ts:98:}): Promise<void> => recordEvent(props.tenantSlug, props.actorHashedId, "upload", {});
src/features/admin/activity-service.ts:101:  tenantSlug: string;
src/features/admin/activity-service.ts:103:}): Promise<void> => recordEvent(props.tenantSlug, props.actorHashedId, "login", {});
src/features/admin/activity-service.ts:137:  tenantSlug: string
src/features/admin/activity-service.ts:142:        "SELECT * FROM root r WHERE r.type=@type AND r.tenantSlug=@tenantSlug ORDER BY r.timestamp DESC",
src/features/admin/activity-service.ts:145:        { name: "@tenantSlug", value: tenantSlug },
src/features/admin/activity-service.ts:150:      .items.query<ActivityEvent>(querySpec, { partitionKey: tenantSlug })
src/features/admin/activity-service.ts:155:    safeLog.error("admin.activity.list-failed", { tenantSlug });
src/features/admin/activity-service.ts:156:    return { status: "ERROR", errors: [{ message: "Unable to load activity events." }] };
src/features/admin/activity-service.ts:161:  tenantSlug: string
src/features/admin/activity-service.ts:164:    FindUsersForTenant(tenantSlug),
src/features/admin/activity-service.ts:165:    findEventsForTenant(tenantSlug),
src/features/admin/activity-service.ts:195:  tenantSlug: string
src/features/admin/activity-service.ts:198:    FindUsersForTenant(tenantSlug),
src/features/admin/activity-service.ts:199:    findEventsForTenant(tenantSlug),
src/features/admin/activity-service.ts:240:// behavior change. See activity-service.test.ts.
src/features/admin/activity-service.ts:241:export const csvEscape = (value: string | number | null): string => {
src/features/admin/activity-service.ts:251:  tenantSlug: string
src/features/admin/activity-service.ts:253:  const rowsResponse = await GetPerUserActivity(tenantSlug);
src/features/admin/activity-service.ts:272:        csvEscape(row.displayName),
src/features/admin/activity-service.ts:273:        csvEscape(row.email),
src/features/admin/activity-service.ts:274:        csvEscape(row.status),
src/features/admin/activity-service.ts:275:        csvEscape(row.lastLoginAt),
src/features/admin/activity-service.ts:276:        csvEscape(row.daysSinceLastLogin),
src/features/admin/activity-service.ts:277:        csvEscape(row.promptsTotal),
src/features/admin/activity-service.ts:278:        csvEscape(row.promptsThisMonth),
src/features/admin/activity-service.ts:279:        csvEscape(row.uploadsTotal),
src/features/admin/activity-service.ts:280:        csvEscape(row.tokensUsedTotal),
src/features/admin/admin-guard.ts:8:  tenantSlug: string;
src/features/admin/admin-guard.ts:19: * from reaching `/admin/*` at the edge using the NextAuth JWT's `isAdmin`
src/features/admin/admin-guard.ts:20: * claim, but every admin server action here re-checks `isAdmin` itself
src/features/admin/admin-guard.ts:22: * re-derives `tenantSlug` from the request `Host` header (Stage 4
src/features/admin/admin-guard.ts:30:  if (!user.isAdmin) {
src/features/admin/admin-guard.ts:35:  const tenantSlug = await getCurrentTenantSlug();
src/features/admin/admin-guard.ts:39:    tenantSlug,
src/features/admin/actions/user-actions.ts:17: * All server actions below re-derive `tenantSlug` and re-check `isAdmin`
src/features/admin/actions/user-actions.ts:67:  const { tenantSlug } = await requireAdminContext();
src/features/admin/actions/user-actions.ts:74:  const result = await UpdateUser(tenantSlug, id, { displayName, email, role, tags });
src/features/admin/actions/user-actions.ts:87:  const { tenantSlug } = await requireAdminContext();
src/features/admin/actions/user-actions.ts:88:  await SetUserStatus(tenantSlug, id, status);
src/features/admin/actions/user-actions.ts:93:  const { tenantSlug } = await requireAdminContext();
src/features/admin/actions/user-actions.ts:94:  await UpdateUser(tenantSlug, id, { role });
src/features/admin/components/stat-card.tsx:10:    <p className="font-mono text-xs uppercase tracking-[0.1em] text-muted-foreground">
src/features/admin/user-service.ts:22: * *tenantSlug* — see `TenantTheme`, `PromptModel`, `PersonaModel`).
src/features/admin/user-service.ts:27: * `/userId` partition path) is set to `tenantSlug`, so "list all users for
src/features/admin/user-service.ts:53:  /** Cosmos partition key — set to `tenantSlug`, see module doc above. */
src/features/admin/user-service.ts:55:  tenantSlug: z.string(),
src/features/admin/user-service.ts:84:const userAccountDocId = (tenantSlug: string, hashedId: string) =>
src/features/admin/user-service.ts:85:  `user-${tenantSlug}-${hashedId}`;
src/features/admin/user-service.ts:105:  tenantSlug: string
src/features/admin/user-service.ts:110:        "SELECT * FROM root r WHERE r.type=@type AND r.tenantSlug=@tenantSlug ORDER BY r.createdAt ASC",
src/features/admin/user-service.ts:113:        { name: "@tenantSlug", value: tenantSlug },
src/features/admin/user-service.ts:118:      .items.query<UserAccount>(querySpec, { partitionKey: tenantSlug })
src/features/admin/user-service.ts:123:    safeLog.error("admin.users.list-failed", { tenantSlug });
src/features/admin/user-service.ts:132:  tenantSlug: string,
src/features/admin/user-service.ts:136:    const { resource } = await ConfigContainer().item(id, tenantSlug).read<UserAccount>();
src/features/admin/user-service.ts:137:    if (!resource || resource.tenantSlug !== tenantSlug) {
src/features/admin/user-service.ts:142:    safeLog.error("admin.users.get-failed", { tenantSlug });
src/features/admin/user-service.ts:148:  tenantSlug: string,
src/features/admin/user-service.ts:154:        "SELECT * FROM root r WHERE r.type=@type AND r.tenantSlug=@tenantSlug AND r.hashedId=@hashedId",
src/features/admin/user-service.ts:157:        { name: "@tenantSlug", value: tenantSlug },
src/features/admin/user-service.ts:163:      .items.query<UserAccount>(querySpec, { partitionKey: tenantSlug })
src/features/admin/user-service.ts:171:    safeLog.error("admin.users.lookup-by-hash-failed", { tenantSlug });
src/features/admin/user-service.ts:178: * (throttled) `lastLoginAt` timestamp on first authenticated request.
src/features/admin/user-service.ts:181: * off-limits (read-only per the Stage 5a brief), so this cannot hook the
src/features/admin/user-service.ts:184: * route (chat, admin, persona, ...). To avoid a Cosmos write on every page
src/features/admin/user-service.ts:185: * navigation, the `lastLoginAt` update itself is throttled to at most once
src/features/admin/user-service.ts:195:    const tenantSlug = await getCurrentTenantSlug();
src/features/admin/user-service.ts:198:    const existing = await findByHashedId(tenantSlug, hashedId);
src/features/admin/user-service.ts:225:    const tenantTheme = await GetTenantTheme(tenantSlug);
src/features/admin/user-service.ts:230:      id: userAccountDocId(tenantSlug, hashedId),
src/features/admin/user-service.ts:232:      userId: tenantSlug,
src/features/admin/user-service.ts:233:      tenantSlug,
src/features/admin/user-service.ts:240:      role: user.isAdmin ? "admin" : "user",
src/features/admin/user-service.ts:275:    const tenantSlug = await getCurrentTenantSlug();
src/features/admin/user-service.ts:277:    const existing = await findByHashedId(tenantSlug, hashedId);
src/features/admin/user-service.ts:295: * again", per the Stage 5c brief's "skippable" requirement) for the current
src/features/admin/user-service.ts:302:    const tenantSlug = await getCurrentTenantSlug();
src/features/admin/user-service.ts:304:    const existing = await findByHashedId(tenantSlug, hashedId);
src/features/admin/user-service.ts:323:    const tenantSlug = await getCurrentTenantSlug();
src/features/admin/user-service.ts:325:    const tenantTheme = await GetTenantTheme(tenantSlug);
src/features/admin/user-service.ts:331:      id: userAccountDocId(tenantSlug, hashedId),
src/features/admin/user-service.ts:333:      userId: tenantSlug,
src/features/admin/user-service.ts:334:      tenantSlug,
src/features/admin/user-service.ts:374:  tenantSlug: string,
src/features/admin/user-service.ts:379:    const existing = await FindUserById(tenantSlug, id);
src/features/admin/user-service.ts:397:    safeLog.error("admin.users.update-failed", { tenantSlug });
src/features/admin/user-service.ts:403:  tenantSlug: string,
src/features/admin/user-service.ts:408:    const existing = await FindUserById(tenantSlug, id);
src/features/admin/user-service.ts:420:    safeLog.error("admin.users.set-status-failed", { tenantSlug });
src/features/common/services/azure-speech.ts:3:import { DefaultAzureCredential, getBearerTokenProvider } from "@azure/identity";
src/features/common/services/azure-speech.ts:23: * (`/api/speech/token`, now deleted) and opened a browser<->Azure WebSocket
src/features/common/services/azure-speech.ts:39: * this app's own Route Handlers (`/api/speech/transcribe`,
src/features/common/services/azure-speech.ts:40: * `/api/speech/synthesize`) over plain same-origin HTTPS — it never holds
src/features/common/services/azure-speech.ts:43: * itself. See `transcribeAudio` / `synthesizeSpeech` below, and the client
src/features/common/services/azure-speech.ts:50: * `DefaultAzureCredential` (managed identity) only, same as `azure-ai.ts` /
src/features/common/services/azure-speech.ts:82: * customer languages. Same list previously used by the (now deleted)
src/features/common/services/azure-speech.ts:89: * How long a single-utterance recognize/synthesize call may run before
src/features/common/services/azure-speech.ts:103:  const credential = new DefaultAzureCredential();
src/features/common/services/azure-speech.ts:110: * `DefaultAzureCredential`. This value never leaves this process — no
src/features/common/services/azure-speech.ts:181:export const transcribeAudio = async (wavBuffer: Buffer): Promise<TranscribeOutcome> => {
src/features/common/services/azure-speech.ts:216: * `require()`) is the SDK's documented way to receive the synthesized
src/features/common/services/azure-speech.ts:221:export const synthesizeSpeech = async (text: string): Promise<Buffer> => {
src/features/common/services/azure-speech.ts:224:  const synthesizer = new SpeechSynthesizer(speechConfig);
src/features/common/services/azure-speech.ts:230:          synthesizer.speakTextAsync(
src/features/common/services/azure-speech.ts:246:    synthesizer.close();
src/features/common/services/key-vault.ts:1:import { DefaultAzureCredential } from "@azure/identity";
src/features/common/services/key-vault.ts:5:  const credential = new DefaultAzureCredential();
src/features/sales-coach/models.ts:8: * modules), §30 (persona architecture).
src/features/sales-coach/models.ts:17: * tenant-theme.ts / user-service.ts / activity-service.ts) is: the `userId`
src/features/sales-coach/models.ts:23: * Customer-entity and meeting-brief documents follow that SAME convention
src/features/sales-coach/models.ts:26: * is named `ownerHashedId` and — per the Stage 5b brief — is included in
src/features/sales-coach/models.ts:78:      "Map decision-makers, influencers and stakeholders by organisational level (strategic/tactical/operational) and persona archetype. Each persona has a primary value language, known triggers and a communication style that works — and one that doesn't.",
src/features/sales-coach/models.ts:180:  personaType: PersonaTypeSchema.nullable(),
src/features/sales-coach/models.ts:198:  /** Cosmos partition key — set to `tenantSlug`, see module doc above. */
src/features/sales-coach/models.ts:200:  tenantSlug: z.string(),
src/features/sales-coach/models.ts:245:  /** Cosmos partition key — set to `tenantSlug`, see module doc above. */
src/features/sales-coach/models.ts:247:  tenantSlug: z.string(),
src/features/sales-coach/models.ts:254:/** F-01 meeting brief — one value-area theme with an impact rating (DESIGN.md §5.3 mini-card). */
src/features/sales-coach/models.ts:263:  personaType: PersonaTypeSchema,
src/features/sales-coach/models.ts:289:  /** Cosmos partition key — set to `tenantSlug`, see module doc above. */
src/features/sales-coach/models.ts:291:  tenantSlug: z.string(),
src/features/sales-coach/models.ts:295:  brief: MeetingBriefSchema,
src/app/(authenticated)/briefs/[id]/page.tsx:2:import { MeetingBrief } from "@/features/sales-coach/components/meeting-brief";
src/app/(authenticated)/briefs/[id]/page.tsx:3:import { FindMeetingBriefById } from "@/features/sales-coach/meeting-brief-service";
src/app/(authenticated)/briefs/[id]/page.tsx:13:  const { tenantSlug, ownerHashedId } = await getSalesCoachActorContext();
src/app/(authenticated)/briefs/[id]/page.tsx:15:  const result = await FindMeetingBriefById(tenantSlug, ownerHashedId, id);
src/app/(authenticated)/briefs/[id]/page.tsx:22:      <Link href="/briefs" className="text-sm text-muted-foreground hover:text-primary-text">
src/app/(authenticated)/briefs/[id]/page.tsx:23:        ← Meeting briefs
src/app/(authenticated)/briefs/[id]/page.tsx:25:      <MeetingBrief brief={result.response.brief} briefId={result.response.id} variant="standalone" />
src/features/sales-coach/intent-detection.ts:6: * AI call. The brief calls for "keyword heuristics + the model itself via a
src/features/sales-coach/context-injection.ts:47://    tenantSlug (see models.ts module doc). Seeded all-active on first read,
src/features/sales-coach/context-injection.ts:51:const moduleConfigDocId = (tenantSlug: string) => `sales-coach-modules-${tenantSlug}`;
src/features/sales-coach/context-injection.ts:53:const buildDefaultModuleConfig = (tenantSlug: string): ModuleConfig => {
src/features/sales-coach/context-injection.ts:56:    id: moduleConfigDocId(tenantSlug),
src/features/sales-coach/context-injection.ts:58:    userId: tenantSlug,
src/features/sales-coach/context-injection.ts:59:    tenantSlug,
src/features/sales-coach/context-injection.ts:74:  tenantSlug: string
src/features/sales-coach/context-injection.ts:78:      query: "SELECT * FROM root r WHERE r.type=@type AND r.tenantSlug=@tenantSlug",
src/features/sales-coach/context-injection.ts:81:        { name: "@tenantSlug", value: tenantSlug },
src/features/sales-coach/context-injection.ts:85:      .items.query<ModuleConfig>(querySpec, { partitionKey: tenantSlug })
src/features/sales-coach/context-injection.ts:98:    safeLog.error("sales-coach.module-config.get-failed", { tenantSlug });
src/features/sales-coach/context-injection.ts:105:  tenantSlug: string
src/features/sales-coach/context-injection.ts:107:  const existing = await GetModuleConfig(tenantSlug);
src/features/sales-coach/context-injection.ts:111:  const seeded = buildDefaultModuleConfig(tenantSlug);
src/features/sales-coach/context-injection.ts:115:    safeLog.error("sales-coach.module-config.seed-failed", { tenantSlug });
src/features/sales-coach/context-injection.ts:120:      return await GetModuleConfig(tenantSlug);
src/features/sales-coach/context-injection.ts:122:    safeLog.error("sales-coach.module-config.seed-failed", { tenantSlug, statusCode: code });
src/features/sales-coach/context-injection.ts:130:export const GetActiveModules = async (tenantSlug: string): Promise<ActiveModuleView[]> => {
src/features/sales-coach/context-injection.ts:131:  const config = await EnsureModuleConfig(tenantSlug);
src/features/sales-coach/context-injection.ts:151:  contacts: Pick<CustomerEntity["contacts"][number], "name" | "title" | "personaType" | "primaryValueArea">[];
src/features/sales-coach/context-injection.ts:190:3. Når \`meetingPrep\` returnerer et resultat med et \`embedDirective\` felt, svarer du med ÉT kort intro-sætning efterfulgt af \`embedDirective\`-værdien indsat ordret som resten af dit svar. Gengiv IKKE brief-indholdet i almindelig tekst — embed-direktivet er hele visningen.`;
src/features/sales-coach/context-injection.ts:205: * `buildSalesCoachSystemPrompt(activeModules, persona)` shape — `persona`
src/features/sales-coach/context-injection.ts:211:  persona: SalesCoachPersonaContext
src/features/sales-coach/context-injection.ts:215:  if (persona.customerContext) {
src/features/sales-coach/context-injection.ts:216:    sections.push(buildCustomerContextSection(persona.customerContext));
src/features/sales-coach/context-injection.ts:219:  if (persona.coachingContext === "meeting-prep") {
src/features/sales-coach/context-injection.ts:221:  } else if (persona.coachingContext === "conversation-coaching") {
src/features/sales-coach/meeting-brief-service.ts:21: * Same `tenantSlug` partition / `ownerHashedId` scoping convention as
src/features/sales-coach/meeting-brief-service.ts:25:const meetingBriefDocId = () => `brief-${uniqueId()}`;
src/features/sales-coach/meeting-brief-service.ts:43:  tenantSlug: string;
src/features/sales-coach/meeting-brief-service.ts:47:  brief: MeetingBrief;
src/features/sales-coach/meeting-brief-service.ts:54:      userId: input.tenantSlug,
src/features/sales-coach/meeting-brief-service.ts:55:      tenantSlug: input.tenantSlug,
src/features/sales-coach/meeting-brief-service.ts:59:      brief: input.brief,
src/features/sales-coach/meeting-brief-service.ts:70:      return { status: "ERROR", errors: [{ message: "Unable to save meeting brief." }] };
src/features/sales-coach/meeting-brief-service.ts:74:      tenantSlug: input.tenantSlug,
src/features/sales-coach/meeting-brief-service.ts:76:      customerName: input.brief.customerName,
src/features/sales-coach/meeting-brief-service.ts:82:    safeLog.error("sales-coach.meeting-brief.create-failed", { tenantSlug: input.tenantSlug });
src/features/sales-coach/meeting-brief-service.ts:83:    return { status: "ERROR", errors: [{ message: "Unable to save meeting brief." }] };
src/features/sales-coach/meeting-brief-service.ts:87:/** All saved briefs for the current seller — powers the `/briefs` list route. */
src/features/sales-coach/meeting-brief-service.ts:89:  tenantSlug: string,
src/features/sales-coach/meeting-brief-service.ts:95:        "SELECT * FROM root r WHERE r.type=@type AND r.tenantSlug=@tenantSlug AND r.ownerHashedId=@ownerHashedId ORDER BY r.createdAt DESC",
src/features/sales-coach/meeting-brief-service.ts:98:        { name: "@tenantSlug", value: tenantSlug },
src/features/sales-coach/meeting-brief-service.ts:104:      .items.query<MeetingBriefDocument>(querySpec, { partitionKey: tenantSlug })
src/features/sales-coach/meeting-brief-service.ts:109:    safeLog.error("sales-coach.meeting-brief.list-failed", { tenantSlug });
src/features/sales-coach/meeting-brief-service.ts:110:    return { status: "ERROR", errors: [{ message: "Unable to load meeting briefs." }] };
src/features/sales-coach/meeting-brief-service.ts:115: * Single brief by id — re-checks `ownerHashedId` even after the
src/features/sales-coach/meeting-brief-service.ts:117: * `FindCustomerEntityById`). Used by both the `/briefs/[id]` page (server
src/features/sales-coach/meeting-brief-service.ts:118: * render) and the chat-stream `{% meeting-brief %}` embed's API route.
src/features/sales-coach/meeting-brief-service.ts:121:  tenantSlug: string,
src/features/sales-coach/meeting-brief-service.ts:126:    const { resource } = await ConfigContainer().item(id, tenantSlug).read<MeetingBriefDocument>();
src/features/sales-coach/meeting-brief-service.ts:128:    if (!resource || resource.tenantSlug !== tenantSlug || resource.ownerHashedId !== ownerHashedId) {
src/features/sales-coach/meeting-brief-service.ts:129:      return { status: "NOT_FOUND", errors: [{ message: "Meeting brief not found." }] };
src/features/sales-coach/meeting-brief-service.ts:134:    safeLog.error("sales-coach.meeting-brief.get-failed", { tenantSlug });
src/features/sales-coach/meeting-brief-service.ts:135:    return { status: "ERROR", errors: [{ message: "Unable to load meeting brief." }] };
src/features/sales-coach/actions/customer-actions.ts:16: * `tenantSlug` + the current seller's `ownerHashedId` from the session —
src/features/sales-coach/actions/customer-actions.ts:32:  customerId: string,
src/features/sales-coach/actions/customer-actions.ts:35:  const tenantSlug = await getCurrentTenantSlug();
src/features/sales-coach/actions/customer-actions.ts:46:  const result = await UpdateCustomerEntity(tenantSlug, ownerHashedId, customerId, {
src/features/sales-coach/actions/customer-actions.ts:53:    safeLog.warn("sales-coach.customers.update-rejected", { tenantSlug });
src/features/sales-coach/actions/customer-actions.ts:57:  revalidatePath(`/customers/${customerId}`);
src/features/sales-coach/actions/customer-actions.ts:62:  customerId: string,
src/features/sales-coach/actions/customer-actions.ts:66:  const tenantSlug = await getCurrentTenantSlug();
src/features/sales-coach/actions/customer-actions.ts:69:  const existing = await FindCustomerEntityById(tenantSlug, ownerHashedId, customerId);
src/features/sales-coach/actions/customer-actions.ts:79:  const result = await UpdateCustomerEntity(tenantSlug, ownerHashedId, customerId, {
src/features/sales-coach/actions/customer-actions.ts:84:    safeLog.warn("sales-coach.customers.notes-update-rejected", { tenantSlug });
src/features/sales-coach/actions/customer-actions.ts:88:  revalidatePath(`/customers/${customerId}`);
src/app/(authenticated)/chat/page.tsx:3:import { FindAllPersonaForCurrentUser } from "@/features/persona-page/persona-services/persona-service";
src/app/(authenticated)/chat/page.tsx:7:  const [personaResponse, extensionResponse] = await Promise.all([
src/app/(authenticated)/chat/page.tsx:12:  if (personaResponse.status !== "OK") {
src/app/(authenticated)/chat/page.tsx:13:    return <DisplayError errors={personaResponse.errors} />;
src/app/(authenticated)/chat/page.tsx:21:      personas={personaResponse.response}
src/features/sales-coach/meeting-prep-tool.ts:7:import { CreateMeetingBrief } from "./meeting-brief-service";
src/features/sales-coach/meeting-prep-tool.ts:19: * the tool does NOT return brief content for the model to restate in prose.
src/features/sales-coach/meeting-prep-tool.ts:21: * (`{% meeting-brief id="..." /%}`) that the model is instructed (system
src/features/sales-coach/meeting-prep-tool.ts:23: * matching Markdoc tag that renders the saved brief as the DESIGN.md §5.3 AI
src/features/sales-coach/meeting-prep-tool.ts:27:  tenantSlug: string;
src/features/sales-coach/meeting-prep-tool.ts:31:  const { tenantSlug, ownerHashedId, chatThreadId } = props;
src/features/sales-coach/meeting-prep-tool.ts:35:      "Generates and saves a structured meeting-preparation brief for the named customer. " +
src/features/sales-coach/meeting-prep-tool.ts:39:      "After this tool returns successfully, respond with one short sentence plus the returned `embedDirective` value inserted verbatim as the rest of your answer — do not restate the brief content in prose.",
src/features/sales-coach/meeting-prep-tool.ts:51:        const existingEntity = await FindCustomerEntityByName(tenantSlug, ownerHashedId, customerName);
src/features/sales-coach/meeting-prep-tool.ts:55:        const brief = await generateMeetingBrief({
src/features/sales-coach/meeting-prep-tool.ts:63:          tenantSlug,
src/features/sales-coach/meeting-prep-tool.ts:67:          brief,
src/features/sales-coach/meeting-prep-tool.ts:71:          safeLog.error("sales-coach.meeting-prep.save-failed", { tenantSlug });
src/features/sales-coach/meeting-prep-tool.ts:72:          return { error: "Unable to save the meeting brief right now. Please try again." };
src/features/sales-coach/meeting-prep-tool.ts:76:          briefId: saved.response.id,
src/features/sales-coach/meeting-prep-tool.ts:78:          embedDirective: `{% meeting-brief id="${saved.response.id}" /%}`,
src/features/sales-coach/meeting-prep-tool.ts:81:        safeLog.error("sales-coach.meeting-prep.generate-failed", { tenantSlug });
src/features/sales-coach/meeting-prep-tool.ts:82:        return { error: "Unable to generate the meeting brief right now. Please try again." };
src/app/(authenticated)/layout.tsx:22:  // SAD §8.4 — lazily upserts the admin user directory entry + a throttled
src/app/(authenticated)/admin/analytics/page.tsx:2:import { GetActivityOverview, GetPerUserActivity } from "@/features/admin/activity-service";
src/app/(authenticated)/admin/analytics/page.tsx:17:  const { tenantSlug } = await requireAdminContext();
src/app/(authenticated)/admin/analytics/page.tsx:18:  const themeResponse = await GetTenantTheme(tenantSlug);
src/app/(authenticated)/admin/analytics/page.tsx:41:    GetActivityOverview(tenantSlug),
src/app/(authenticated)/admin/analytics/page.tsx:42:    GetPerUserActivity(tenantSlug),
src/app/(authenticated)/admin/analytics/page.tsx:65:        <h2 className="font-display text-lg font-bold text-foreground">Per-user activity</h2>
src/app/(authenticated)/admin/analytics/page.tsx:110:                  No activity recorded yet.
src/app/(authenticated)/admin/layout.tsx:16: * defense in depth, re-checking the same `isAdmin` claim from
src/app/(authenticated)/admin/layout.tsx:28:  if (!user.isAdmin) {
src/app/(authenticated)/admin/layout.tsx:35:        <p className="font-mono text-xs uppercase tracking-[0.1em] text-muted-foreground">
src/features/sales-coach/components/meeting-brief.tsx:11: * 1. Inline in the chat stream, via the `{% meeting-brief id="..." /%}`
src/features/sales-coach/components/meeting-brief.tsx:13: * 2. Standalone on `/briefs/[id]` (server-rendered, no client fetch).
src/features/sales-coach/components/meeting-brief.tsx:45:  brief,
src/features/sales-coach/components/meeting-brief.tsx:46:  briefId,
src/features/sales-coach/components/meeting-brief.tsx:49:  brief: MeetingBriefData;
src/features/sales-coach/components/meeting-brief.tsx:50:  briefId?: string;
src/features/sales-coach/components/meeting-brief.tsx:57:          Meeting Brief — {brief.customerName}
src/features/sales-coach/components/meeting-brief.tsx:61:      <p className="mt-3 text-sm text-muted-foreground">{brief.meetingTopic}</p>
src/features/sales-coach/components/meeting-brief.tsx:65:        <p className="mt-2 font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
src/features/sales-coach/components/meeting-brief.tsx:66:          {brief.framing.type === "burning-platform" ? "Burning Platform" : "Burning Ambition"}
src/features/sales-coach/components/meeting-brief.tsx:68:        <p className="mt-1 text-base text-foreground">{brief.framing.narrative}</p>
src/features/sales-coach/components/meeting-brief.tsx:75:          {brief.openingQuestions.map((q, i) => (
src/features/sales-coach/components/meeting-brief.tsx:84:      {brief.discoveryQuestionsByPersona.length > 0 && (
src/features/sales-coach/components/meeting-brief.tsx:88:            {brief.discoveryQuestionsByPersona.map((group, i) => (
src/features/sales-coach/components/meeting-brief.tsx:90:                <p className="font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
src/features/sales-coach/components/meeting-brief.tsx:91:                  {group.personaType.replace("-", " · ")}
src/features/sales-coach/components/meeting-brief.tsx:106:      {brief.valueAreaThemes.length > 0 && (
src/features/sales-coach/components/meeting-brief.tsx:108:          {brief.valueAreaThemes.map((theme, i) => (
src/features/sales-coach/components/meeting-brief.tsx:110:              <p className="font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
src/features/sales-coach/components/meeting-brief.tsx:123:      {brief.nextSteps.length > 0 && (
src/features/sales-coach/components/meeting-brief.tsx:127:            {brief.nextSteps.map((step, i) => (
src/features/sales-coach/components/meeting-brief.tsx:134:      {variant === "embedded" && briefId && (
src/features/sales-coach/components/meeting-brief.tsx:137:            href={`/briefs/${briefId}`}
src/features/sales-coach/components/meeting-brief.tsx:143:            Open saved brief
src/features/sales-coach/context-injection.test.ts:103:  it("includes the customer context section (persona) when customerContext is provided", () => {
src/features/sales-coach/context-injection.test.ts:114:            personaType: "strategic-guardian",
src/features/sales-coach/components/persona-card.tsx:9: * F-04 auto-generated stakeholder persona card — DESIGN.md §5.7 "Persona
src/features/sales-coach/components/persona-card.tsx:14:// Deterministic ray-color assignment per persona type (§2.6 — data-viz only,
src/features/sales-coach/components/persona-card.tsx:26:  const orgLevel = contact.personaType ? PERSONA_TYPE_ORG_LEVEL[contact.personaType] : null;
src/features/sales-coach/components/persona-card.tsx:27:  const ray = contact.personaType ? PERSONA_RAY[contact.personaType] : 7;
src/features/sales-coach/components/persona-card.tsx:36:        {contact.personaType && (
src/features/sales-coach/components/persona-card.tsx:38:            className="rounded-pill px-3 py-1 text-xs font-medium uppercase tracking-[0.06em]"
src/features/sales-coach/components/persona-card.tsx:41:            {PERSONA_TYPE_LABELS[contact.personaType]}
src/features/sales-coach/components/persona-card.tsx:48:          <dt className="font-mono text-xs uppercase tracking-[0.06em] text-muted-foreground">Org-niveau</dt>
src/features/sales-coach/components/persona-card.tsx:52:          <dt className="font-mono text-xs uppercase tracking-[0.06em] text-muted-foreground">Primary value</dt>
src/features/sales-coach/components/persona-card.tsx:59:            <dt className="font-mono text-xs uppercase tracking-[0.06em] text-muted-foreground">
src/features/sales-coach/components/persona-card.tsx:69:          <p className="font-mono text-xs uppercase tracking-[0.06em] text-muted-foreground">Kendte triggers</p>
src/features/sales-coach/components/persona-card.tsx:85:          <p className="font-mono text-xs uppercase tracking-[0.06em] text-tertiary">Kommunikations-tips</p>
src/features/sales-coach/components/persona-card.tsx:96:          <p className="font-mono text-xs uppercase tracking-[0.06em] text-muted-foreground">
src/app/(authenticated)/persona/page.tsx:1:import { ChatPersonaPage } from "@/features/persona-page/persona-page";
src/app/(authenticated)/persona/page.tsx:2:import { FindAllPersonaForCurrentUser } from "@/features/persona-page/persona-services/persona-service";
src/app/(authenticated)/persona/page.tsx:6:  const personasResponse = await FindAllPersonaForCurrentUser();
src/app/(authenticated)/persona/page.tsx:7:  if (personasResponse.status !== "OK") {
src/app/(authenticated)/persona/page.tsx:8:    return <DisplayError errors={personasResponse.errors} />;
src/app/(authenticated)/persona/page.tsx:10:  return <ChatPersonaPage personas={personasResponse.response} />;
src/features/sales-coach/customer-entity-service.ts:23: * Every read/write below filters on BOTH `tenantSlug` (the Cosmos partition
src/features/sales-coach/customer-entity-service.ts:47:  tenantSlug: string,
src/features/sales-coach/customer-entity-service.ts:53:        "SELECT * FROM root r WHERE r.type=@type AND r.tenantSlug=@tenantSlug AND r.ownerHashedId=@ownerHashedId ORDER BY r.lastInteraction DESC",
src/features/sales-coach/customer-entity-service.ts:56:        { name: "@tenantSlug", value: tenantSlug },
src/features/sales-coach/customer-entity-service.ts:62:      .items.query<CustomerEntity>(querySpec, { partitionKey: tenantSlug })
src/features/sales-coach/customer-entity-service.ts:67:    safeLog.error("sales-coach.customers.list-failed", { tenantSlug });
src/features/sales-coach/customer-entity-service.ts:74:  tenantSlug: string,
src/features/sales-coach/customer-entity-service.ts:79:    const { resource } = await ConfigContainer().item(id, tenantSlug).read<CustomerEntity>();
src/features/sales-coach/customer-entity-service.ts:81:    if (!resource || resource.tenantSlug !== tenantSlug || resource.ownerHashedId !== ownerHashedId) {
src/features/sales-coach/customer-entity-service.ts:87:    safeLog.error("sales-coach.customers.get-failed", { tenantSlug });
src/features/sales-coach/customer-entity-service.ts:94:  tenantSlug: string,
src/features/sales-coach/customer-entity-service.ts:101:        "SELECT * FROM root r WHERE r.type=@type AND r.tenantSlug=@tenantSlug AND r.ownerHashedId=@ownerHashedId AND r.customerNameNormalized=@name",
src/features/sales-coach/customer-entity-service.ts:104:        { name: "@tenantSlug", value: tenantSlug },
src/features/sales-coach/customer-entity-service.ts:111:      .items.query<CustomerEntity>(querySpec, { partitionKey: tenantSlug })
src/features/sales-coach/customer-entity-service.ts:119:    safeLog.error("sales-coach.customers.lookup-by-name-failed", { tenantSlug });
src/features/sales-coach/customer-entity-service.ts:125:  tenantSlug: string;
src/features/sales-coach/customer-entity-service.ts:137:      userId: input.tenantSlug,
src/features/sales-coach/customer-entity-service.ts:138:      tenantSlug: input.tenantSlug,
src/features/sales-coach/customer-entity-service.ts:163:    safeLog.error("sales-coach.customers.create-failed", { tenantSlug: input.tenantSlug, statusCode: code });
src/features/sales-coach/customer-entity-service.ts:170:  tenantSlug: string,
src/features/sales-coach/customer-entity-service.ts:175:  const existing = await FindCustomerEntityById(tenantSlug, ownerHashedId, id);
src/features/sales-coach/customer-entity-service.ts:199:    safeLog.error("sales-coach.customers.update-failed", { tenantSlug });
src/features/sales-coach/customer-entity-service.ts:224:      personaType: contact.personaType ?? current.personaType,
src/features/sales-coach/customer-entity-service.ts:244:  tenantSlug: string;
src/features/sales-coach/customer-entity-service.ts:251:  const existing = await FindCustomerEntityByName(input.tenantSlug, input.ownerHashedId, input.customerName);
src/features/sales-coach/customer-entity-service.ts:254:    return UpdateCustomerEntityInteraction(input.tenantSlug, input.ownerHashedId, existing.response.id, {
src/features/sales-coach/customer-entity-service.ts:266:    tenantSlug: input.tenantSlug,
src/features/sales-coach/customer-entity-service.ts:277:  tenantSlug: string,
src/features/sales-coach/customer-entity-service.ts:286:  const existing = await FindCustomerEntityById(tenantSlug, ownerHashedId, id);
src/features/sales-coach/customer-entity-service.ts:305:    safeLog.error("sales-coach.customers.interaction-update-failed", { tenantSlug });
src/features/sales-coach/customer-entity-service.ts:312:  tenantSlug: string;
src/features/sales-coach/customer-entity-service.ts:317:  const existing = await FindCustomerEntityByName(input.tenantSlug, input.ownerHashedId, input.customerName);
src/features/sales-coach/customer-entity-service.ts:324:          tenantSlug: input.tenantSlug,
src/features/sales-coach/customer-entity-service.ts:341:      return { status: "ERROR", errors: [{ message: "Unable to link meeting brief." }] };
src/features/sales-coach/customer-entity-service.ts:345:    safeLog.error("sales-coach.customers.link-brief-failed", { tenantSlug: input.tenantSlug });
src/features/sales-coach/customer-entity-service.ts:346:    return { status: "ERROR", errors: [{ message: "Unable to link meeting brief." }] };
src/app/(authenticated)/admin/analytics/export/route.ts:2:import { BuildActivityCsv } from "@/features/admin/activity-service";
src/app/(authenticated)/admin/analytics/export/route.ts:7: * CSV export of the per-user activity table (SAD §8.6 / §15.4-style
src/app/(authenticated)/admin/analytics/export/route.ts:9: * — `requireAdminContext()` re-checks `isAdmin` and re-derives `tenantSlug`
src/app/(authenticated)/admin/analytics/export/route.ts:12:export async function GET(): Promise<Response> {
src/app/(authenticated)/admin/analytics/export/route.ts:13:  const { tenantSlug } = await requireAdminContext();
src/app/(authenticated)/admin/analytics/export/route.ts:15:  const themeResponse = await GetTenantTheme(tenantSlug);
src/app/(authenticated)/admin/analytics/export/route.ts:23:  const csvResponse = await BuildActivityCsv(tenantSlug);
src/app/(authenticated)/admin/analytics/export/route.ts:24:  if (csvResponse.status !== "OK") {
src/app/(authenticated)/admin/analytics/export/route.ts:25:    return new NextResponse("Unable to build activity export.", { status: 500 });
src/app/(authenticated)/admin/analytics/export/route.ts:28:  return new NextResponse(csvResponse.response, {
src/app/(authenticated)/admin/analytics/export/route.ts:31:      "Content-Type": "text/csv; charset=utf-8",
src/app/(authenticated)/admin/analytics/export/route.ts:32:      "Content-Disposition": `attachment; filename="${tenantSlug}-activity-export.csv"`,
src/app/(authenticated)/admin/groups/page.tsx:3:  deleteTagDimensionAction,
src/app/(authenticated)/admin/groups/page.tsx:13:  const { tenantSlug } = await requireAdminContext();
src/app/(authenticated)/admin/groups/page.tsx:14:  const dimensionsResponse = await GetTagDimensions(tenantSlug);
src/app/(authenticated)/admin/groups/page.tsx:60:                <form action={deleteTagDimensionAction.bind(null, dimension)}>
src/features/sales-coach/stt-cleanup.ts:23: * surfaces a cleanup failure as a user-facing error.
src/features/sales-coach/stt-cleanup.ts:54:export const cleanupSttTranscript = async (rawText: string): Promise<SttCleanupResult> => {
src/features/sales-coach/stt-cleanup.ts:69:    safeLog.warn("sales-coach.stt-cleanup-failed");
src/features/sales-coach/stt-cleanup.test.ts:20:import { cleanupSttTranscript } from "./stt-cleanup";
src/features/sales-coach/stt-cleanup.test.ts:22:describe("cleanupSttTranscript", () => {
src/features/sales-coach/stt-cleanup.test.ts:28:    const result = await cleanupSttTranscript("   ");
src/features/sales-coach/stt-cleanup.test.ts:38:    const result = await cleanupSttTranscript("øhm altså mødet gik meget godt ikk");
src/features/sales-coach/stt-cleanup.test.ts:47:    const result = await cleanupSttTranscript("raw dictation text, unmodified");
src/features/sales-coach/stt-cleanup.test.ts:58:    await expect(cleanupSttTranscript("still falls back")).resolves.toEqual({
src/features/sales-coach/components/meeting-brief-embed.tsx:5:import { MeetingBrief } from "./meeting-brief";
src/features/sales-coach/components/meeting-brief-embed.tsx:8: * Chat-stream renderer for the `{% meeting-brief id="..." /%}` Markdoc
src/features/sales-coach/components/meeting-brief-embed.tsx:9: * directive (see `markdown/config.tsx` / `markdown/meeting-brief-tag.tsx`).
src/features/sales-coach/components/meeting-brief-embed.tsx:10: * The model only ever emits the directive + a brief id — this component
src/features/sales-coach/components/meeting-brief-embed.tsx:11: * fetches the saved brief from the auth-scoped read API
src/features/sales-coach/components/meeting-brief-embed.tsx:12: * (`/api/sales-coach/meeting-briefs/[id]`) and renders it with the same
src/features/sales-coach/components/meeting-brief-embed.tsx:13: * `<MeetingBrief>` presentational component the standalone `/briefs/[id]`
src/features/sales-coach/components/meeting-brief-embed.tsx:20:    | { status: "ok"; brief: MeetingBriefData }
src/features/sales-coach/components/meeting-brief-embed.tsx:26:    fetch(`/api/sales-coach/meeting-briefs/${id}`)
src/features/sales-coach/components/meeting-brief-embed.tsx:31:      .then((data: { brief: MeetingBriefData }) => {
src/features/sales-coach/components/meeting-brief-embed.tsx:32:        if (!cancelled) setState({ status: "ok", brief: data.brief });
src/features/sales-coach/components/meeting-brief-embed.tsx:46:        Loading meeting brief…
src/features/sales-coach/components/meeting-brief-embed.tsx:54:        This meeting brief could not be loaded. It may have been removed, or you may not have access to it.
src/features/sales-coach/components/meeting-brief-embed.tsx:59:  return <MeetingBrief brief={state.brief} briefId={id} variant="embedded" />;
src/app/(authenticated)/api/speech/synthesize/route.ts:2:import { isSpeechConfigured, synthesizeSpeech } from "@/features/common/services/azure-speech";
src/app/(authenticated)/api/speech/synthesize/route.ts:9: * deleted) `/api/speech/token` route was shared by both STT and TTS: the
src/app/(authenticated)/api/speech/synthesize/route.ts:11: * *both* directions (mic audio up, synthesized audio down). Deleting that
src/app/(authenticated)/api/speech/synthesize/route.ts:18: * Auth: same defense-in-depth as `transcribe/route.ts` — `middleware.ts`
src/app/(authenticated)/api/speech/synthesize/route.ts:21:export async function POST(req: Request): Promise<Response> {
src/app/(authenticated)/api/speech/synthesize/route.ts:67:    const audio = await synthesizeSpeech(text);
src/app/(authenticated)/api/speech/synthesize/route.ts:76:    safeLog.error("speech.synthesize-failed", { requestId });
src/app/(authenticated)/api/speech/synthesize/route.ts:78:      { error: true, code: "speech_synthesize_error", message: "Unable to synthesize speech." },
src/app/(authenticated)/customers/page.tsx:15:  const { tenantSlug, ownerHashedId } = await getSalesCoachActorContext();
src/app/(authenticated)/customers/page.tsx:16:  const result = await FindCustomerEntitiesForOwner(tenantSlug, ownerHashedId);
src/app/(authenticated)/customers/page.tsx:27:        <p className="font-mono text-xs uppercase tracking-[0.1em] text-muted-foreground">Coach 360</p>
src/app/(authenticated)/customers/page.tsx:62:                      className="rounded-pill bg-secondary px-2 py-0.5 text-xs uppercase tracking-[0.06em] text-secondary-foreground"
src/app/(authenticated)/api/chat/route.ts:4:export async function POST(req: Request): Promise<Response> {
src/app/(authenticated)/api/images/route.ts:3:export async function GET(req: Request) {
src/app/(authenticated)/admin/settings/page.tsx:12:  const { tenantSlug } = await requireAdminContext();
src/app/(authenticated)/admin/settings/page.tsx:13:  const themeResponse = await EnsureTenantTheme(tenantSlug);
src/app/(authenticated)/admin/settings/page.tsx:29:          <dd className="font-mono">{theme.tenantSlug}</dd>
src/app/(authenticated)/api/speech/cleanup/route.ts:1:import { cleanupSttTranscript } from "@/features/sales-coach/stt-cleanup";
src/app/(authenticated)/api/speech/cleanup/route.ts:6: * `generateObject` round-trip, see stt-cleanup.ts). Always returns 200 with
src/app/(authenticated)/api/speech/cleanup/route.ts:7: * usable text: a cleanup failure falls back to the raw transcript rather
src/app/(authenticated)/api/speech/cleanup/route.ts:14:export async function POST(req: Request): Promise<Response> {
src/app/(authenticated)/api/speech/cleanup/route.ts:35:    const result = await cleanupSttTranscript(rawText);
src/app/(authenticated)/api/speech/cleanup/route.ts:38:    // cleanupSttTranscript already falls back internally on model failure —
src/app/(authenticated)/api/speech/cleanup/route.ts:41:    safeLog.error("speech.cleanup-route-failed", { requestId });
src/app/(authenticated)/api/sales-coach/meeting-briefs/[id]/route.ts:2:import { FindMeetingBriefById } from "@/features/sales-coach/meeting-brief-service";
src/app/(authenticated)/api/sales-coach/meeting-briefs/[id]/route.ts:8: * backs the `{% meeting-brief id="..." /%}` chat-stream embed
src/app/(authenticated)/api/sales-coach/meeting-briefs/[id]/route.ts:10: * `ownerHashedId`/`tenantSlug` are re-derived server-side from the
src/app/(authenticated)/api/sales-coach/meeting-briefs/[id]/route.ts:14:export async function GET(
src/app/(authenticated)/api/sales-coach/meeting-briefs/[id]/route.ts:20:    const [tenantSlug, ownerHashedId] = await Promise.all([
src/app/(authenticated)/api/sales-coach/meeting-briefs/[id]/route.ts:25:    const result = await FindMeetingBriefById(tenantSlug, ownerHashedId, id);
src/app/(authenticated)/api/sales-coach/meeting-briefs/[id]/route.ts:31:      return NextResponse.json({ error: "Unable to load meeting brief" }, { status: 500 });
src/app/(authenticated)/api/sales-coach/meeting-briefs/[id]/route.ts:34:    return NextResponse.json({ brief: result.response.brief });
src/app/(authenticated)/customers/[id]/page.tsx:3:import { PersonaCard } from "@/features/sales-coach/components/persona-card";
src/app/(authenticated)/customers/[id]/page.tsx:26: * F-03 customer profile detail + F-04 persona cards.
src/app/(authenticated)/customers/[id]/page.tsx:31:  const { tenantSlug, ownerHashedId } = await getSalesCoachActorContext();
src/app/(authenticated)/customers/[id]/page.tsx:33:  const result = await FindCustomerEntityById(tenantSlug, ownerHashedId, id);
src/app/(authenticated)/customers/[id]/page.tsx:49:            {customer.meetingHistory.length} saved brief{customer.meetingHistory.length === 1 ? "" : "s"} · Last
src/app/(authenticated)/customers/[id]/page.tsx:96:          <h2 className="font-display text-lg font-bold text-foreground">Meeting briefs</h2>
src/app/(authenticated)/customers/[id]/page.tsx:98:            {customer.meetingHistory.map((briefId) => (
src/app/(authenticated)/customers/[id]/page.tsx:99:              <li key={briefId}>
src/app/(authenticated)/customers/[id]/page.tsx:100:                <Link href={`/briefs/${briefId}`} className="text-sm text-primary-text hover:underline">
src/app/(authenticated)/customers/[id]/page.tsx:101:                  {briefId}
src/app/(authenticated)/customers/[id]/page.tsx:114:            their persona profile automatically.
src/app/(authenticated)/api/speech/transcribe/route.ts:7:import { isSpeechConfigured, transcribeAudio } from "@/features/common/services/azure-speech";
src/app/(authenticated)/api/speech/transcribe/route.ts:17: * 1376). Replaces the deleted `/api/speech/token` + client-side Speech SDK
src/app/(authenticated)/api/speech/transcribe/route.ts:27: * `api/sales-coach/meeting-briefs/[id]/route.ts`) so this route is never
src/app/(authenticated)/api/speech/transcribe/route.ts:37:export async function POST(req: Request): Promise<Response> {
src/app/(authenticated)/api/speech/transcribe/route.ts:92:    const result = await transcribeAudio(buffer);
src/app/(authenticated)/api/speech/transcribe/route.ts:102:    safeLog.error("speech.transcribe-failed", { requestId });
src/app/(authenticated)/api/speech/transcribe/route.ts:104:      { error: true, code: "speech_transcribe_error", message: "Unable to transcribe audio." },
src/app/(authenticated)/admin/users/page.tsx:47:  const { tenantSlug } = await requireAdminContext();
src/app/(authenticated)/admin/users/page.tsx:50:    FindUsersForTenant(tenantSlug),
src/app/(authenticated)/admin/users/page.tsx:51:    GetTagDimensions(tenantSlug),
src/app/(authenticated)/admin/users/page.tsx:133:                      className="rounded-pill border border-border-strong px-2 py-1 font-mono text-xs uppercase tracking-[0.08em] hover:border-primary hover:text-primary-text"
src/app/(authenticated)/admin/users/new/page.tsx:11:  const { tenantSlug } = await requireAdminContext();
src/app/(authenticated)/admin/users/new/page.tsx:12:  const dimensionsResponse = await GetTagDimensions(tenantSlug);
src/app/(authenticated)/admin/users/[id]/page.tsx:18:  const { tenantSlug } = await requireAdminContext();
src/app/(authenticated)/admin/users/[id]/page.tsx:21:    FindUserById(tenantSlug, id),
src/app/(authenticated)/admin/users/[id]/page.tsx:22:    GetTagDimensions(tenantSlug),

exec
/bin/zsh -lc "sed -n '1,240p' src/middleware.ts" in /Users/hugosson/workspace/SalesPrism
 succeeded in 0ms:
import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";

// IMPORTANT: every entry here must ALSO appear in `config.matcher` below.
// Middleware only executes for paths the matcher selects — an entry present
// here but absent there is silently unenforced. That gap previously left
// /customers, /briefs, /persona and /prompt without an auth check, so an
// anonymous request reached server code that throws on the missing session
// (a 500 instead of a login redirect). Caught by the E2E access-control spec;
// keep the two lists in sync.
const requireAuth: string[] = [
  "/chat",
  "/api",
  "/reporting",
  "/unauthorized",
  "/persona",
  "/prompt",
  "/admin",
  "/customers",
  "/briefs",
];
const requireAdmin: string[] = ["/reporting", "/admin"];

export async function middleware(request: NextRequest) {
  const res = NextResponse.next();
  const pathname = request.nextUrl.pathname;

  if (requireAuth.some((path) => pathname.startsWith(path))) {
    const token = await getToken({
      req: request,
    });

    //check not logged in
    if (!token) {
      const url = new URL(`/`, request.url);
      return NextResponse.redirect(url);
    }

    if (requireAdmin.some((path) => pathname.startsWith(path))) {
      //check if not authorized
      if (!token.isAdmin) {
        const url = new URL(`/unauthorized`, request.url);
        return NextResponse.rewrite(url);
      }
    }
  }

  return res;
}

// note that middleware is not applied to api/auth as this is required to logon (i.e. requires anon access)
export const config = {
  matcher: [
    "/unauthorized/:path*",
    "/reporting/:path*",
    "/api/chat/:path*",
    "/api/chat",
    "/api/images/:path*",
    "/api/speech/:path*",
    "/api/sales-coach/:path*",
    "/chat/:path*",
    "/admin/:path*",
    "/customers/:path*",
    "/customers",
    "/briefs/:path*",
    "/briefs",
    "/persona/:path*",
    "/prompt/:path*",
  ],
};

exec
/bin/zsh -lc "find src/app -path '*api*' -type f | sort" in /Users/hugosson/workspace/SalesPrism
 succeeded in 0ms:
src/app/(authenticated)/api/auth/[...nextauth]/route.ts
src/app/(authenticated)/api/chat/route.ts
src/app/(authenticated)/api/images/route.ts
src/app/(authenticated)/api/sales-coach/meeting-briefs/[id]/route.ts
src/app/(authenticated)/api/speech/cleanup/route.ts
src/app/(authenticated)/api/speech/synthesize/route.ts
src/app/(authenticated)/api/speech/transcribe/route.ts

codex
The boundary is where it should be: middleware covers the new API prefixes, but that only protects against anonymous access. I’m now checking whether the server handlers and Cosmos access paths independently enforce tenant and seller scoping, and whether any “admin” capability trusts client state too far.
Security/GDPR review focused on the newly added SalesPrism surfaces the user listed.
  → Inspect auth and authorization on new routes/pages/services, including tenant and seller scoping for customer entities and meeting briefs
  • Inspect speech proxy, logging/telemetry, prompt-injection paths, and client-exposed secret risk
  • Inspect GDPR deletion/retention/export behavior for new containers and admin/activity flows, then compile findings with severity and fixes
exec
/bin/zsh -lc "sed -n '1,260p' src/features/sales-coach/customer-entity-service.ts" in /Users/hugosson/workspace/SalesPrism
exec
/bin/zsh -lc "sed -n '1,260p' src/features/sales-coach/meeting-brief-service.ts" in /Users/hugosson/workspace/SalesPrism
 succeeded in 0ms:
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
  CUSTOMER_ENTITY_ATTRIBUTE,
  CustomerContact,
  CustomerEntity,
  CustomerEntitySchema,
  ValueArea,
} from "./models";

/**
 * Customer Entity Service — SHARED 1 (backlog "Tekniske Fælles-komponenter").
 * Used by F-01, F-02, F-03, F-04.
 *
 * Every read/write below filters on BOTH `tenantSlug` (the Cosmos partition
 * key, `ConfigContainer` convention — see models.ts module doc) AND
 * `ownerHashedId` (the owning seller's hashed identity). Never drop the
 * `ownerHashedId` filter from a query — a seller's customer intelligence is
 * private to that seller; cross-user leakage here is a security bug, not
 * just a data-quality bug.
 */

const customerEntityDocId = () => `customer-${uniqueId()}`;

// Exported (was module-private) so it can be unit-tested directly — no
// behavior change. See customer-entity-service.test.ts.
export const normalizeCustomerName = (name: string): string => name.trim().toLowerCase();

const parseCustomerEntity = (raw: unknown): ServerActionResponse<CustomerEntity> => {
  const parsed = CustomerEntitySchema.safeParse(raw);
  if (!parsed.success) {
    return { status: "ERROR", errors: zodErrorsToServerActionErrors(parsed.error.errors) };
  }
  return { status: "OK", response: parsed.data };
};

/** All customer entities owned by the current seller, for this tenant. Powers the `/customers` list view. */
export const FindCustomerEntitiesForOwner = async (
  tenantSlug: string,
  ownerHashedId: string
): Promise<ServerActionResponse<CustomerEntity[]>> => {
  try {
    const querySpec: SqlQuerySpec = {
      query:
        "SELECT * FROM root r WHERE r.type=@type AND r.tenantSlug=@tenantSlug AND r.ownerHashedId=@ownerHashedId ORDER BY r.lastInteraction DESC",
      parameters: [
        { name: "@type", value: CUSTOMER_ENTITY_ATTRIBUTE },
        { name: "@tenantSlug", value: tenantSlug },
        { name: "@ownerHashedId", value: ownerHashedId },
      ],
    };

    const { resources } = await ConfigContainer()
      .items.query<CustomerEntity>(querySpec, { partitionKey: tenantSlug })
      .fetchAll();

    return { status: "OK", response: resources };
  } catch (error) {
    safeLog.error("sales-coach.customers.list-failed", { tenantSlug });
    return { status: "ERROR", errors: [{ message: "Unable to load customers." }] };
  }
};

/** Single customer entity by id — re-checks `ownerHashedId` even after the partition-scoped point read. */
export const FindCustomerEntityById = async (
  tenantSlug: string,
  ownerHashedId: string,
  id: string
): Promise<ServerActionResponse<CustomerEntity>> => {
  try {
    const { resource } = await ConfigContainer().item(id, tenantSlug).read<CustomerEntity>();

    if (!resource || resource.tenantSlug !== tenantSlug || resource.ownerHashedId !== ownerHashedId) {
      return { status: "NOT_FOUND", errors: [{ message: "Customer not found." }] };
    }

    return parseCustomerEntity(resource);
  } catch (error) {
    safeLog.error("sales-coach.customers.get-failed", { tenantSlug });
    return { status: "ERROR", errors: [{ message: "Unable to load customer." }] };
  }
};

/** Case-insensitive lookup by customer name, scoped to this seller. Used by F-01 proactive context + F-03 upsert-by-name. */
export const FindCustomerEntityByName = async (
  tenantSlug: string,
  ownerHashedId: string,
  customerName: string
): Promise<ServerActionResponse<CustomerEntity>> => {
  try {
    const querySpec: SqlQuerySpec = {
      query:
        "SELECT * FROM root r WHERE r.type=@type AND r.tenantSlug=@tenantSlug AND r.ownerHashedId=@ownerHashedId AND r.customerNameNormalized=@name",
      parameters: [
        { name: "@type", value: CUSTOMER_ENTITY_ATTRIBUTE },
        { name: "@tenantSlug", value: tenantSlug },
        { name: "@ownerHashedId", value: ownerHashedId },
        { name: "@name", value: normalizeCustomerName(customerName) },
      ],
    };

    const { resources } = await ConfigContainer()
      .items.query<CustomerEntity>(querySpec, { partitionKey: tenantSlug })
      .fetchAll();

    if (resources.length === 0) {
      return { status: "NOT_FOUND", errors: [{ message: "Customer not found." }] };
    }
    return parseCustomerEntity(resources[0]);
  } catch (error) {
    safeLog.error("sales-coach.customers.lookup-by-name-failed", { tenantSlug });
    return { status: "ERROR", errors: [{ message: "Unable to load customer." }] };
  }
};

export const CreateCustomerEntity = async (input: {
  tenantSlug: string;
  ownerHashedId: string;
  customerName: string;
  knownChallenges?: string[];
  contacts?: CustomerContact[];
  valueAreas?: ValueArea[];
}): Promise<ServerActionResponse<CustomerEntity>> => {
  try {
    const now = new Date().toISOString();
    const model: CustomerEntity = {
      id: customerEntityDocId(),
      type: CUSTOMER_ENTITY_ATTRIBUTE,
      userId: input.tenantSlug,
      tenantSlug: input.tenantSlug,
      ownerHashedId: input.ownerHashedId,
      customerName: input.customerName,
      customerNameNormalized: normalizeCustomerName(input.customerName),
      contacts: input.contacts ?? [],
      knownChallenges: input.knownChallenges ?? [],
      lastInteraction: now,
      meetingHistory: [],
      valueAreas: input.valueAreas ?? [],
      createdAt: now,
      updatedAt: now,
    };

    const parsed = CustomerEntitySchema.safeParse(model);
    if (!parsed.success) {
      return { status: "ERROR", errors: zodErrorsToServerActionErrors(parsed.error.errors) };
    }

    const { resource } = await ConfigContainer().items.create<CustomerEntity>(parsed.data);
    if (!resource) {
      return { status: "ERROR", errors: [{ message: "Unable to create customer." }] };
    }
    return { status: "OK", response: resource };
  } catch (error) {
    const code = (error as { code?: number })?.code;
    safeLog.error("sales-coach.customers.create-failed", { tenantSlug: input.tenantSlug, statusCode: code });
    return { status: "ERROR", errors: [{ message: "Unable to create customer." }] };
  }
};

/** Editable-fields patch (contacts / challenges / notes) — used by the `/customers/[id]` edit form. */
export const UpdateCustomerEntity = async (
  tenantSlug: string,
  ownerHashedId: string,
  id: string,
  patch: Partial<Pick<CustomerEntity, "customerName" | "contacts" | "knownChallenges" | "valueAreas">>
): Promise<ServerActionResponse<CustomerEntity>> => {
  const existing = await FindCustomerEntityById(tenantSlug, ownerHashedId, id);
  if (existing.status !== "OK") return existing;

  try {
    const updated: CustomerEntity = {
      ...existing.response,
      ...patch,
      customerNameNormalized: patch.customerName
        ? normalizeCustomerName(patch.customerName)
        : existing.response.customerNameNormalized,
      updatedAt: new Date().toISOString(),
    };

    const parsed = CustomerEntitySchema.safeParse(updated);
    if (!parsed.success) {
      return { status: "ERROR", errors: zodErrorsToServerActionErrors(parsed.error.errors) };
    }

    const { resource } = await ConfigContainer().items.upsert<CustomerEntity>(parsed.data);
    if (!resource) {
      return { status: "ERROR", errors: [{ message: "Unable to update customer." }] };
    }
    return { status: "OK", response: resource };
  } catch (error) {
    safeLog.error("sales-coach.customers.update-failed", { tenantSlug });
    return { status: "ERROR", errors: [{ message: "Unable to update customer." }] };
  }
};

const dedupe = (values: string[]): string[] => Array.from(new Set(values.filter((v) => v.trim().length > 0)));

// Exported (was module-private) so it can be unit-tested directly — no
// behavior change. See customer-entity-service.test.ts.
export const mergeContacts = (
  existing: CustomerContact[],
  incoming: CustomerContact[]
): CustomerContact[] => {
  const byName = new Map(existing.map((c) => [c.name.trim().toLowerCase(), c]));
  for (const contact of incoming) {
    const key = contact.name.trim().toLowerCase();
    const current = byName.get(key);
    if (!current) {
      byName.set(key, contact);
      continue;
    }
    // Merge: prefer newly-classified fields, keep prior ones as fallback, union arrays.
    byName.set(key, {
      name: current.name,
      title: contact.title || current.title,
      personaType: contact.personaType ?? current.personaType,
      primaryValueArea: contact.primaryValueArea ?? current.primaryValueArea,
      secondaryValueArea: contact.secondaryValueArea ?? current.secondaryValueArea,
      knownTriggers: dedupe([...current.knownTriggers, ...contact.knownTriggers]),
      communicationTips: contact.communicationTips.length > 0 ? contact.communicationTips : current.communicationTips,
      suggestedQuestions: contact.suggestedQuestions.length > 0 ? contact.suggestedQuestions : current.suggestedQuestions,
      notes: contact.notes || current.notes,
    });
  }
  return Array.from(byName.values());
};

/**
 * F-03 auto-extraction upsert: finds-or-creates a customer entity for
 * `customerName`, merges in newly-observed challenges/triggers/value-areas/
 * contacts, and bumps `lastInteraction`. Called from
 * `extraction-service.ts`'s onFinish hook — never called directly from the
 * request/response path.
 */
export const UpsertCustomerEntityFromExtraction = async (input: {
  tenantSlug: string;
  ownerHashedId: string;
  customerName: string;
  newChallenges?: string[];
  newValueAreas?: ValueArea[];
  newContacts?: CustomerContact[];
}): Promise<ServerActionResponse<CustomerEntity>> => {
  const existing = await FindCustomerEntityByName(input.tenantSlug, input.ownerHashedId, input.customerName);

  if (existing.status === "OK") {
    return UpdateCustomerEntityInteraction(input.tenantSlug, input.ownerHashedId, existing.response.id, {
      newChallenges: input.newChallenges,
      newValueAreas: input.newValueAreas,
      newContacts: input.newContacts,
    });
  }


 succeeded in 0ms:
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
 * Same `tenantSlug` partition / `ownerHashedId` scoping convention as
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
  ownerHashedId: string;
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
      ownerHashedId: input.ownerHashedId,
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
      ownerHashedId: input.ownerHashedId,
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
  ownerHashedId: string
): Promise<ServerActionResponse<MeetingBriefDocument[]>> => {
  try {
    const querySpec: SqlQuerySpec = {
      query:
        "SELECT * FROM root r WHERE r.type=@type AND r.tenantSlug=@tenantSlug AND r.ownerHashedId=@ownerHashedId ORDER BY r.createdAt DESC",
      parameters: [
        { name: "@type", value: MEETING_BRIEF_ATTRIBUTE },
        { name: "@tenantSlug", value: tenantSlug },
        { name: "@ownerHashedId", value: ownerHashedId },
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
 * Single brief by id — re-checks `ownerHashedId` even after the
 * partition-scoped point read (defense in depth, same pattern as
 * `FindCustomerEntityById`). Used by both the `/briefs/[id]` page (server
 * render) and the chat-stream `{% meeting-brief %}` embed's API route.
 */
export const FindMeetingBriefById = async (
  tenantSlug: string,
  ownerHashedId: string,
  id: string
): Promise<ServerActionResponse<MeetingBriefDocument>> => {
  try {
    const { resource } = await ConfigContainer().item(id, tenantSlug).read<MeetingBriefDocument>();

    if (!resource || resource.tenantSlug !== tenantSlug || resource.ownerHashedId !== ownerHashedId) {
      return { status: "NOT_FOUND", errors: [{ message: "Meeting brief not found." }] };
    }

    return parseMeetingBriefDocument(resource);
  } catch (error) {
    safeLog.error("sales-coach.meeting-brief.get-failed", { tenantSlug });
    return { status: "ERROR", errors: [{ message: "Unable to load meeting brief." }] };
  }
};

exec
/bin/zsh -lc "sed -n '1,220p' src/features/sales-coach/actor-context.ts" in /Users/hugosson/workspace/SalesPrism
exec
/bin/zsh -lc "sed -n '1,220p' src/app/'(authenticated)'/customers/'[id]'/page.tsx" in /Users/hugosson/workspace/SalesPrism
 succeeded in 0ms:
import "server-only";

import { userHashedId } from "@/features/auth-page/helpers";
import { getCurrentTenantSlug } from "@/features/theme/tenant-resolver";

/**
 * Shared `{ tenantSlug, ownerHashedId }` resolution for every Sales Coach
 * page/route that scopes data to "the current seller" — mirrors
 * `requireAdminContext()`'s pattern (admin-guard.ts) but without the
 * `isAdmin` check, since customers/briefs are per-seller data available to
 * every authenticated user, not an admin-only section.
 */
export const getSalesCoachActorContext = async (): Promise<{
  tenantSlug: string;
  ownerHashedId: string;
}> => {
  const [tenantSlug, ownerHashedId] = await Promise.all([
    getCurrentTenantSlug(),
    userHashedId(),
  ]);
  return { tenantSlug, ownerHashedId };
};

exec
/bin/zsh -lc "sed -n '1,220p' src/app/'(authenticated)'/api/sales-coach/meeting-briefs/'[id]'/route.ts" in /Users/hugosson/workspace/SalesPrism
 succeeded in 0ms:
import { updateContactNotesAction, updateCustomerProfileAction } from "@/features/sales-coach/actions/customer-actions";
import { getSalesCoachActorContext } from "@/features/sales-coach/actor-context";
import { PersonaCard } from "@/features/sales-coach/components/persona-card";
import { FindCustomerEntityById } from "@/features/sales-coach/customer-entity-service";
import { VALUE_AREA_LABELS, ValueArea } from "@/features/sales-coach/models";
import { Button } from "@/features/ui/button";
import { DisplayError } from "@/features/ui/error/display-error";
import { Input } from "@/features/ui/input";
import { Label } from "@/features/ui/label";
import { Textarea } from "@/features/ui/textarea";
import Link from "next/link";

interface Props {
  params: Promise<{ id: string }>;
}

const ALL_VALUE_AREAS: ValueArea[] = [
  "speed-agility",
  "people-processes",
  "risk-governance",
  "economics-control",
  "sustainability-responsibility",
];

/**
 * F-03 customer profile detail + F-04 persona cards.
 * DESIGN.md "Customer Profile — DSV Logistics" screen conventions.
 */
export default async function CustomerDetailPage(props: Props) {
  const { id } = await props.params;
  const { tenantSlug, ownerHashedId } = await getSalesCoachActorContext();

  const result = await FindCustomerEntityById(tenantSlug, ownerHashedId, id);
  if (result.status !== "OK") {
    return <DisplayError errors={result.errors} />;
  }

  const customer = result.response;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-8 py-8">
      <header className="flex items-center justify-between">
        <div>
          <Link href="/customers" className="text-sm text-muted-foreground hover:text-primary-text">
            ← Customers
          </Link>
          <h1 className="mt-1 font-display text-2xl font-bold text-foreground">{customer.customerName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {customer.meetingHistory.length} saved brief{customer.meetingHistory.length === 1 ? "" : "s"} · Last
            interaction {new Date(customer.lastInteraction).toLocaleDateString()}
          </p>
        </div>
      </header>

      <section className="rounded-md border border-border bg-card p-6">
        <h2 className="font-display text-lg font-bold text-foreground">Profile</h2>
        <form action={updateCustomerProfileAction.bind(null, customer.id)} className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="customerName">Customer name</Label>
            <Input id="customerName" name="customerName" defaultValue={customer.customerName} required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="knownChallenges">Known challenges</Label>
            <Textarea
              id="knownChallenges"
              name="knownChallenges"
              rows={4}
              defaultValue={customer.knownChallenges.join("\n")}
            />
            <p className="text-xs text-muted-foreground">One challenge per line.</p>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Value areas</Label>
            <div className="flex flex-wrap gap-3">
              {ALL_VALUE_AREAS.map((area) => (
                <label key={area} className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    name="valueAreas"
                    value={area}
                    defaultChecked={customer.valueAreas.includes(area)}
                  />
                  {VALUE_AREA_LABELS[area]}
                </label>
              ))}
            </div>
          </div>
          <div>
            <Button type="submit">Save changes</Button>
          </div>
        </form>
      </section>

      {customer.meetingHistory.length > 0 && (
        <section className="rounded-md border border-border bg-card p-6">
          <h2 className="font-display text-lg font-bold text-foreground">Meeting briefs</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {customer.meetingHistory.map((briefId) => (
              <li key={briefId}>
                <Link href={`/briefs/${briefId}`} className="text-sm text-primary-text hover:underline">
                  {briefId}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="font-display text-lg font-bold text-foreground">Stakeholders</h2>
        {customer.contacts.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No stakeholders identified yet. Mention a person&apos;s name and title in chat and Coach 360 will build
            their persona profile automatically.
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-4">
            {customer.contacts.map((contact) => (
              <div key={contact.name} className="flex flex-col gap-3">
                <PersonaCard contact={contact} />
                <form
                  action={updateContactNotesAction.bind(null, customer.id, contact.name)}
                  className="flex flex-col gap-2 rounded-md border border-border bg-card p-4"
                >
                  <Label htmlFor={`notes-${contact.name}`}>Notes — {contact.name}</Label>
                  <Textarea
                    id={`notes-${contact.name}`}
                    name="notes"
                    rows={2}
                    defaultValue={contact.notes}
                  />
                  <div>
                    <Button type="submit" variant="outline" size="sm">
                      Save notes
                    </Button>
                  </div>
                </form>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

 succeeded in 0ms:
import { userHashedId } from "@/features/auth-page/helpers";
import { FindMeetingBriefById } from "@/features/sales-coach/meeting-brief-service";
import { getCurrentTenantSlug } from "@/features/theme/tenant-resolver";
import { NextRequest, NextResponse } from "next/server";

/**
 * Read-only, auth-scoped accessor for a single saved MeetingBrief (F-01) —
 * backs the `{% meeting-brief id="..." /%}` chat-stream embed
 * (`MeetingBriefEmbed`). Never trusts a client-supplied user/tenant id:
 * `ownerHashedId`/`tenantSlug` are re-derived server-side from the
 * authenticated session on every request, exactly like every Server Action
 * in `chat-services/*` and `admin/*`.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    const [tenantSlug, ownerHashedId] = await Promise.all([
      getCurrentTenantSlug(),
      userHashedId(),
    ]);

    const result = await FindMeetingBriefById(tenantSlug, ownerHashedId, id);

    if (result.status === "NOT_FOUND") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (result.status !== "OK") {
      return NextResponse.json({ error: "Unable to load meeting brief" }, { status: 500 });
    }

    return NextResponse.json({ brief: result.response.brief });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

exec
/bin/zsh -lc "sed -n '1,220p' src/app/'(authenticated)'/briefs/'[id]'/page.tsx" in /Users/hugosson/workspace/SalesPrism
 succeeded in 0ms:
import { getSalesCoachActorContext } from "@/features/sales-coach/actor-context";
import { MeetingBrief } from "@/features/sales-coach/components/meeting-brief";
import { FindMeetingBriefById } from "@/features/sales-coach/meeting-brief-service";
import { DisplayError } from "@/features/ui/error/display-error";
import Link from "next/link";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function BriefDetailPage(props: Props) {
  const { id } = await props.params;
  const { tenantSlug, ownerHashedId } = await getSalesCoachActorContext();

  const result = await FindMeetingBriefById(tenantSlug, ownerHashedId, id);
  if (result.status !== "OK") {
    return <DisplayError errors={result.errors} />;
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-8 py-8">
      <Link href="/briefs" className="text-sm text-muted-foreground hover:text-primary-text">
        ← Meeting briefs
      </Link>
      <MeetingBrief brief={result.response.brief} briefId={result.response.id} variant="standalone" />
    </div>
  );
}

codex
The seller-private surfaces are using server-derived `tenantSlug` and `ownerHashedId` at the read points I’ve checked so far. I’m moving into admin services and server actions now, because that’s where a tenant-wide read or mutation is most likely to bypass the intended boundary.
exec
/bin/zsh -lc "sed -n '1,260p' src/features/admin/group-service.ts" in /Users/hugosson/workspace/SalesPrism
exec
/bin/zsh -lc "sed -n '1,240p' src/features/admin/admin-guard.ts" in /Users/hugosson/workspace/SalesPrism
exec
/bin/zsh -lc "sed -n '1,320p' src/features/admin/user-service.ts" in /Users/hugosson/workspace/SalesPrism
 succeeded in 0ms:
import "server-only";

import { getCurrentUser, userHashedId } from "@/features/auth-page/helpers";
import { getCurrentTenantSlug } from "@/features/theme/tenant-resolver";
import { safeLog } from "@/features/common/services/safe-logger";

export type AdminContext = {
  tenantSlug: string;
  hashedId: string;
  displayName: string;
  email: string;
};

/**
 * Server-side admin-role + tenant-scope guard shared by every `/admin`
 * page and server action.
 *
 * Defense in depth: `src/middleware.ts` already blocks non-admin sessions
 * from reaching `/admin/*` at the edge using the NextAuth JWT's `isAdmin`
 * claim, but every admin server action here re-checks `isAdmin` itself
 * (never trust client input for role/tenant — CLAUDE.md) and always
 * re-derives `tenantSlug` from the request `Host` header (Stage 4
 * resolver), never from a client-supplied value. Throws instead of
 * returning a `ServerActionResponse` so a forgotten guard check fails
 * loudly rather than silently leaking data.
 */
export const requireAdminContext = async (): Promise<AdminContext> => {
  const user = await getCurrentUser();

  if (!user.isAdmin) {
    safeLog.warn("admin.access-denied");
    throw new Error("Forbidden: admin role required");
  }

  const tenantSlug = await getCurrentTenantSlug();
  const hashedId = await userHashedId();

  return {
    tenantSlug,
    hashedId,
    displayName: user.name,
    email: user.email,
  };
};

 succeeded in 0ms:
import "server-only";

import {
  ServerActionResponse,
  zodErrorsToServerActionErrors,
} from "@/features/common/server-action-response";
import { ConfigContainer } from "@/features/common/services/cosmos";
import { safeLog } from "@/features/common/services/safe-logger";
import { z } from "zod";
import { FindUsersForTenant, UserAccount } from "./user-service";

/**
 * Tag-dimension registry — SAD v2.7 §8.4/§8.6.
 *
 * `UserAccount.tags` is a free-form `Record<string,string>` (each customer
 * defines their own dimensions, e.g. `{ land, by, afdeling }` for DSV). That
 * alone lets an admin filter/report on whatever keys happen to exist on
 * users today, but gives no way to (a) create a new dimension before any
 * user has it, or (b) rename/delete a dimension across every user in one
 * action. This document tracks the tenant's known dimension names
 * explicitly, in the same `ConfigContainer` / tenantSlug-partition
 * convention as `UserAccount` and `TenantTheme`.
 */
export const TAG_DIMENSIONS_ATTRIBUTE = "TAG_DIMENSIONS";

export const TagDimensionsSchema = z.object({
  id: z.string(),
  type: z.literal(TAG_DIMENSIONS_ATTRIBUTE),
  /** Cosmos partition key — set to `tenantSlug`. */
  userId: z.string(),
  tenantSlug: z.string(),
  dimensions: z.array(z.string()),
  updatedAt: z.string(),
});
export type TagDimensions = z.infer<typeof TagDimensionsSchema>;

const tagDimensionsDocId = (tenantSlug: string) => `tag-dimensions-${tenantSlug}`;

export const GetTagDimensions = async (
  tenantSlug: string
): Promise<ServerActionResponse<TagDimensions>> => {
  try {
    const { resource } = await ConfigContainer()
      .item(tagDimensionsDocId(tenantSlug), tenantSlug)
      .read<TagDimensions>();

    if (!resource) {
      return {
        status: "OK",
        response: {
          id: tagDimensionsDocId(tenantSlug),
          type: TAG_DIMENSIONS_ATTRIBUTE,
          userId: tenantSlug,
          tenantSlug,
          dimensions: [],
          updatedAt: new Date(0).toISOString(),
        },
      };
    }

    const parsed = TagDimensionsSchema.safeParse(resource);
    if (!parsed.success) {
      return {
        status: "ERROR",
        errors: zodErrorsToServerActionErrors(parsed.error.errors),
      };
    }
    return { status: "OK", response: parsed.data };
  } catch (error) {
    const code = (error as { code?: number })?.code;
    if (code === 404) {
      return {
        status: "OK",
        response: {
          id: tagDimensionsDocId(tenantSlug),
          type: TAG_DIMENSIONS_ATTRIBUTE,
          userId: tenantSlug,
          tenantSlug,
          dimensions: [],
          updatedAt: new Date(0).toISOString(),
        },
      };
    }
    safeLog.error("admin.groups.get-failed", { tenantSlug });
    return { status: "ERROR", errors: [{ message: "Unable to load tag dimensions." }] };
  }
};

const upsertDimensions = async (
  tenantSlug: string,
  dimensions: string[]
): Promise<ServerActionResponse<TagDimensions>> => {
  const model: TagDimensions = {
    id: tagDimensionsDocId(tenantSlug),
    type: TAG_DIMENSIONS_ATTRIBUTE,
    userId: tenantSlug,
    tenantSlug,
    dimensions: Array.from(new Set(dimensions)).filter((d) => d.trim().length > 0),
    updatedAt: new Date().toISOString(),
  };

  const { resource } = await ConfigContainer().items.upsert<TagDimensions>(model);
  if (!resource) {
    return { status: "ERROR", errors: [{ message: "Unable to save tag dimensions." }] };
  }
  return { status: "OK", response: resource };
};

export const AddTagDimension = async (
  tenantSlug: string,
  name: string
): Promise<ServerActionResponse<TagDimensions>> => {
  try {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      return { status: "ERROR", errors: [{ message: "Dimension name cannot be empty." }] };
    }

    const existing = await GetTagDimensions(tenantSlug);
    if (existing.status !== "OK") return existing;

    return await upsertDimensions(tenantSlug, [...existing.response.dimensions, trimmed]);
  } catch (error) {
    safeLog.error("admin.groups.add-failed", { tenantSlug });
    return { status: "ERROR", errors: [{ message: "Unable to add tag dimension." }] };
  }
};

/** Renames a dimension: updates the registry AND every user's `tags` key across the tenant. */
export const RenameTagDimension = async (
  tenantSlug: string,
  oldName: string,
  newName: string
): Promise<ServerActionResponse<TagDimensions>> => {
  try {
    const trimmedNew = newName.trim();
    if (trimmedNew.length === 0) {
      return { status: "ERROR", errors: [{ message: "Dimension name cannot be empty." }] };
    }

    const existing = await GetTagDimensions(tenantSlug);
    if (existing.status !== "OK") return existing;

    const renamed = existing.response.dimensions.map((d) => (d === oldName ? trimmedNew : d));
    const dimensionsResult = await upsertDimensions(tenantSlug, renamed);
    if (dimensionsResult.status !== "OK") return dimensionsResult;

    await rewriteTagKeyOnAllUsers(tenantSlug, oldName, trimmedNew);
    return dimensionsResult;
  } catch (error) {
    safeLog.error("admin.groups.rename-failed", { tenantSlug });
    return { status: "ERROR", errors: [{ message: "Unable to rename tag dimension." }] };
  }
};

/** Deletes a dimension: removes it from the registry AND every user's `tags`. */
export const DeleteTagDimension = async (
  tenantSlug: string,
  name: string
): Promise<ServerActionResponse<TagDimensions>> => {
  try {
    const existing = await GetTagDimensions(tenantSlug);
    if (existing.status !== "OK") return existing;

    const remaining = existing.response.dimensions.filter((d) => d !== name);
    const dimensionsResult = await upsertDimensions(tenantSlug, remaining);
    if (dimensionsResult.status !== "OK") return dimensionsResult;

    await rewriteTagKeyOnAllUsers(tenantSlug, name, null);
    return dimensionsResult;
  } catch (error) {
    safeLog.error("admin.groups.delete-failed", { tenantSlug });
    return { status: "ERROR", errors: [{ message: "Unable to delete tag dimension." }] };
  }
};

/**
 * Renames (or, if `newKey` is `null`, deletes) a single tag key across
 * every `UserAccount` in the tenant. Best-effort per-user — one bad doc
 * does not abort the whole batch, since this can touch every user in the
 * tenant.
 */
const rewriteTagKeyOnAllUsers = async (
  tenantSlug: string,
  oldKey: string,
  newKey: string | null
): Promise<void> => {
  const usersResponse = await FindUsersForTenant(tenantSlug);
  if (usersResponse.status !== "OK") return;

  await Promise.all(
    usersResponse.response
      .filter((u) => Object.prototype.hasOwnProperty.call(u.tags, oldKey))
      .map(async (u) => {
        const { [oldKey]: value, ...rest } = u.tags;
        const nextTags = newKey ? { ...rest, [newKey]: value } : rest;
        const updated: UserAccount = { ...u, tags: nextTags };
        try {
          await ConfigContainer().items.upsert<UserAccount>(updated);
        } catch {
          safeLog.error("admin.groups.rewrite-user-tag-failed", { tenantSlug });
        }
      })
  );
};

 succeeded in 0ms:
import "server-only";

import { getCurrentUser, hashValue, userHashedId } from "@/features/auth-page/helpers";
import {
  ServerActionResponse,
  zodErrorsToServerActionErrors,
} from "@/features/common/server-action-response";
import { ConfigContainer } from "@/features/common/services/cosmos";
import { safeLog } from "@/features/common/services/safe-logger";
import { getCurrentTenantSlug } from "@/features/theme/tenant-resolver";
import { GetTenantTheme } from "@/features/theme/tenant-theme";
import { SqlQuerySpec } from "@azure/cosmos";
import { z } from "zod";

/**
 * Customer-admin user directory — SAD v2.7 §8.4.
 *
 * Container/schema decision: there is no dedicated "users" Cosmos
 * container — `src/features/common/services/cosmos.ts` only exposes
 * `HistoryContainer` (chat data, partitioned on the *end user's* hashed
 * id) and `ConfigContainer` (tenant-level config, partitioned on
 * *tenantSlug* — see `TenantTheme`, `PromptModel`, `PersonaModel`).
 *
 * `UserAccount` documents are tenant directory data, not per-user chat
 * data, so they follow the `ConfigContainer`/`TenantTheme` convention:
 * partition key value (`userId` field, per the container's fixed
 * `/userId` partition path) is set to `tenantSlug`, so "list all users for
 * my tenant" / "list all tag dimensions for my tenant" is always a single,
 * cheap, partition-scoped query — never a cross-partition scan — even
 * though each customer already has a fully isolated Cosmos account (SAD
 * §6.1) and in principle only ever holds one tenant's data.
 */
export const USER_ACCOUNT_ATTRIBUTE = "USER_ACCOUNT";

export const UserRoleSchema = z.enum(["user", "admin"]);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const UserStatusSchema = z.enum(["active", "disabled"]);
export type UserStatus = z.infer<typeof UserStatusSchema>;

/**
 * Matches `TenantTheme.authMethod` (SAD §8.1/§8.2/§8.3). Per-tenant, not
 * per-user — every user of a given tenant shares the same auth method,
 * decided once at onboarding. Stored per-user here purely for display in
 * the admin users table without an extra TenantTheme lookup per row.
 */
export const UserAuthMethodSchema = z.enum(["entra-sso", "username-password"]);
export type UserAuthMethod = z.infer<typeof UserAuthMethodSchema>;

export const UserAccountSchema = z.object({
  id: z.string(),
  type: z.literal(USER_ACCOUNT_ATTRIBUTE),
  /** Cosmos partition key — set to `tenantSlug`, see module doc above. */
  userId: z.string(),
  tenantSlug: z.string(),
  /**
   * SHA-256 hash of the authenticated user's email (`userHashedId()`) —
   * the same identity value used throughout `chat-services/*`. This is
   * how `EnsureUserOnLogin` finds "my own" doc and how `EnsureChatThreadOperation`-style
   * ownership checks could later cross-reference a chat-history `userId`
   * back to a directory entry. Never the raw email/name.
   */
  hashedId: z.string(),
  displayName: z.string(),
  email: z.string(),
  role: UserRoleSchema,
  authMethod: UserAuthMethodSchema,
  tags: z.record(z.string(), z.string()),
  createdAt: z.string(),
  lastLoginAt: z.string().nullable(),
  status: UserStatusSchema,
  /**
   * ISO timestamp of when this user completed (or skipped) the first-login
   * onboarding flow (Stage 5c, SAD §18 Phase F) — `null` until then.
   * `.default(null)` so existing Cosmos documents written before this field
   * existed still parse successfully (treated as "not yet onboarded",
   * which is the correct/safe interpretation for pre-existing users too —
   * worst case they see the skippable onboarding flow once more).
   */
  onboardingCompletedAt: z.string().nullable().default(null),
});
export type UserAccount = z.infer<typeof UserAccountSchema>;

const userAccountDocId = (tenantSlug: string, hashedId: string) =>
  `user-${tenantSlug}-${hashedId}`;

/** Below this age, `EnsureUserOnLogin` skips the `lastLoginAt` write entirely. */
const LOGIN_TIMESTAMP_THROTTLE_MS = 5 * 60 * 1000;

const parseUserAccount = (
  raw: unknown
): ServerActionResponse<UserAccount> => {
  const parsed = UserAccountSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      status: "ERROR",
      errors: zodErrorsToServerActionErrors(parsed.error.errors),
    };
  }
  return { status: "OK", response: parsed.data };
};

/** All users for a tenant — single partition-key query, see module doc above. */
export const FindUsersForTenant = async (
  tenantSlug: string
): Promise<ServerActionResponse<UserAccount[]>> => {
  try {
    const querySpec: SqlQuerySpec = {
      query:
        "SELECT * FROM root r WHERE r.type=@type AND r.tenantSlug=@tenantSlug ORDER BY r.createdAt ASC",
      parameters: [
        { name: "@type", value: USER_ACCOUNT_ATTRIBUTE },
        { name: "@tenantSlug", value: tenantSlug },
      ],
    };

    const { resources } = await ConfigContainer()
      .items.query<UserAccount>(querySpec, { partitionKey: tenantSlug })
      .fetchAll();

    return { status: "OK", response: resources };
  } catch (error) {
    safeLog.error("admin.users.list-failed", { tenantSlug });
    return {
      status: "ERROR",
      errors: [{ message: "Unable to load users for this tenant." }],
    };
  }
};

export const FindUserById = async (
  tenantSlug: string,
  id: string
): Promise<ServerActionResponse<UserAccount>> => {
  try {
    const { resource } = await ConfigContainer().item(id, tenantSlug).read<UserAccount>();
    if (!resource || resource.tenantSlug !== tenantSlug) {
      return { status: "NOT_FOUND", errors: [{ message: "User not found." }] };
    }
    return parseUserAccount(resource);
  } catch (error) {
    safeLog.error("admin.users.get-failed", { tenantSlug });
    return { status: "ERROR", errors: [{ message: "Unable to load user." }] };
  }
};

const findByHashedId = async (
  tenantSlug: string,
  hashedId: string
): Promise<ServerActionResponse<UserAccount>> => {
  try {
    const querySpec: SqlQuerySpec = {
      query:
        "SELECT * FROM root r WHERE r.type=@type AND r.tenantSlug=@tenantSlug AND r.hashedId=@hashedId",
      parameters: [
        { name: "@type", value: USER_ACCOUNT_ATTRIBUTE },
        { name: "@tenantSlug", value: tenantSlug },
        { name: "@hashedId", value: hashedId },
      ],
    };

    const { resources } = await ConfigContainer()
      .items.query<UserAccount>(querySpec, { partitionKey: tenantSlug })
      .fetchAll();

    if (resources.length === 0) {
      return { status: "NOT_FOUND", errors: [{ message: "User not found." }] };
    }
    return parseUserAccount(resources[0]);
  } catch (error) {
    safeLog.error("admin.users.lookup-by-hash-failed", { tenantSlug });
    return { status: "ERROR", errors: [{ message: "Unable to load user." }] };
  }
};

/**
 * Lazily upserts the current authenticated user's directory entry and
 * (throttled) `lastLoginAt` timestamp on first authenticated request.
 *
 * NextAuth's own callbacks (`src/features/auth-page/auth-api.ts`) are
 * off-limits (read-only per the Stage 5a brief), so this cannot hook the
 * actual sign-in event — it is instead called once per request from
 * `src/app/(authenticated)/layout.tsx`, which wraps every authenticated
 * route (chat, admin, persona, ...). To avoid a Cosmos write on every page
 * navigation, the `lastLoginAt` update itself is throttled to at most once
 * per `LOGIN_TIMESTAMP_THROTTLE_MS`.
 *
 * Best-effort: failures are logged (safeLog) and swallowed — a Cosmos
 * hiccup here must never block the user from using the product.
 */
export const EnsureUserOnLogin = async (): Promise<void> => {
  try {
    const user = await getCurrentUser();
    const hashedId = await userHashedId();
    const tenantSlug = await getCurrentTenantSlug();
    const now = new Date().toISOString();

    const existing = await findByHashedId(tenantSlug, hashedId);

    if (existing.status === "OK") {
      const doc = existing.response;
      const lastLoginAge = doc.lastLoginAt
        ? Date.now() - new Date(doc.lastLoginAt).getTime()
        : Number.POSITIVE_INFINITY;

      if (lastLoginAge < LOGIN_TIMESTAMP_THROTTLE_MS) {
        return;
      }

      await ConfigContainer().items.upsert<UserAccount>({
        ...doc,
        // Keep displayName/email in sync with the identity provider without
        // clobbering admin-managed fields (role, tags, status).
        displayName: user.name,
        email: user.email,
        lastLoginAt: now,
      });
      return;
    }

    if (existing.status !== "NOT_FOUND") {
      return; // transient read error already logged by findByHashedId
    }

    const tenantTheme = await GetTenantTheme(tenantSlug);
    const authMethod: UserAuthMethod =
      tenantTheme.status === "OK" ? tenantTheme.response.authMethod : "username-password";

    const seeded: UserAccount = {
      id: userAccountDocId(tenantSlug, hashedId),
      type: USER_ACCOUNT_ATTRIBUTE,
      userId: tenantSlug,
      tenantSlug,
      hashedId,
      displayName: user.name,
      email: user.email,
      // First-ever user for a tenant, or any email covered by
      // ADMIN_EMAIL_ADDRESS, seeds as admin so a fresh tenant is never
      // locked out of its own /admin section.
      role: user.isAdmin ? "admin" : "user",
      authMethod,
      tags: {},
      createdAt: now,
      lastLoginAt: now,
      status: "active",
      onboardingCompletedAt: null,
    };

    await ConfigContainer().items.create<UserAccount>(seeded);
  } catch (error) {
    // Cosmos raises 409 if a concurrent request already created/updated the
    // same doc first — not an error, just lost a race. Anything else: log
    // and swallow, never break the authenticated app shell over this.
    const code = (error as { code?: number })?.code;
    if (code !== 409) {
      safeLog.error("admin.users.ensure-on-login-failed");
    }
  }
};

/**
 * First-login onboarding status (Stage 5c, SAD §18 Phase F) for the
 * CURRENT authenticated user. Called once per authenticated page load
 * (see `(authenticated)/layout.tsx`, right after `EnsureUserOnLogin` — so
 * by the time this runs, the caller's own directory entry is guaranteed to
 * already exist), to decide whether to auto-open the onboarding modal.
 *
 * Fails OPEN to "already completed" on a lookup error — a Cosmos hiccup
 * must never re-surface the onboarding flow to an existing user who has
 * already seen/skipped it; the flow is also always reachable again from
 * the Help panel regardless of this result.
 */
export const GetOnboardingStatus = async (): Promise<{ completed: boolean }> => {
  try {
    const tenantSlug = await getCurrentTenantSlug();
    const hashedId = await userHashedId();
    const existing = await findByHashedId(tenantSlug, hashedId);

    if (existing.status === "OK") {
      return { completed: Boolean(existing.response.onboardingCompletedAt) };
    }
    if (existing.status === "NOT_FOUND") {
      // Genuinely brand new user — should not happen post-`EnsureUserOnLogin`,
      // but if it does, show onboarding (the safe default for a new user).
      return { completed: false };
    }
    return { completed: true }; // transient read error — fail open, don't nag
  } catch {
    return { completed: true };
  }
};

/**
 * Marks onboarding complete (or explicitly skipped — both are "don't ask
 * again", per the Stage 5c brief's "skippable" requirement) for the current
 * authenticated user. Best-effort: a write failure here must never block
 * the user from closing/using the onboarding modal — the client always
 * treats it as dismissed regardless of whether this persisted.
 */
export const MarkOnboardingCompleted = async (): Promise<void> => {
  try {
    const tenantSlug = await getCurrentTenantSlug();
    const hashedId = await userHashedId();
    const existing = await findByHashedId(tenantSlug, hashedId);
    if (existing.status !== "OK") return;

    await ConfigContainer().items.upsert<UserAccount>({
      ...existing.response,
      onboardingCompletedAt: new Date().toISOString(),
    });
  } catch {
    safeLog.error("admin.users.mark-onboarding-completed-failed");
  }
};

export const CreateUser = async (input: {
  displayName: string;
  email: string;
  role: UserRole;
  tags: Record<string, string>;

exec
/bin/zsh -lc "sed -n '1,320p' src/features/admin/activity-service.ts" in /Users/hugosson/workspace/SalesPrism
 succeeded in 0ms:
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

// Exported (was module-private) so it can be unit-tested directly — no
// behavior change. See activity-service.test.ts.
export const csvEscape = (value: string | number | null): string => {
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

exec
/bin/zsh -lc "sed -n '1,220p' src/app/'(authenticated)'/admin/analytics/export/route.ts" in /Users/hugosson/workspace/SalesPrism
 succeeded in 0ms:
import { requireAdminContext } from "@/features/admin/admin-guard";
import { BuildActivityCsv } from "@/features/admin/activity-service";
import { GetTenantTheme } from "@/features/theme/tenant-theme";
import { NextResponse } from "next/server";

/**
 * CSV export of the per-user activity table (SAD §8.6 / §15.4-style
 * on-request export, scoped to a single tenant). Admin-guarded server-side
 * — `requireAdminContext()` re-checks `isAdmin` and re-derives `tenantSlug`
 * from the request `Host` header; nothing here trusts client input.
 */
export async function GET(): Promise<Response> {
  const { tenantSlug } = await requireAdminContext();

  const themeResponse = await GetTenantTheme(tenantSlug);
  const userAnalyticsEnabled =
    themeResponse.status === "OK" && themeResponse.response.features.userAnalytics;

  if (!userAnalyticsEnabled) {
    return new NextResponse("Analytics is not enabled for this tenant.", { status: 403 });
  }

  const csvResponse = await BuildActivityCsv(tenantSlug);
  if (csvResponse.status !== "OK") {
    return new NextResponse("Unable to build activity export.", { status: 500 });
  }

  return new NextResponse(csvResponse.response, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${tenantSlug}-activity-export.csv"`,
    },
  });
}

exec
/bin/zsh -lc "sed -n '1,220p' src/features/admin/actions/user-actions.ts && printf '\\n---SPLIT---\\n' && sed -n '1,200p' src/features/admin/actions/group-actions.ts" in /Users/hugosson/workspace/SalesPrism
 succeeded in 0ms:
"use server";
import "server-only";

import { requireAdminContext } from "@/features/admin/admin-guard";
import {
  CreateUser,
  SetUserStatus,
  UpdateUser,
  UserRole,
  UserStatus,
} from "@/features/admin/user-service";
import { safeLog } from "@/features/common/services/safe-logger";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

/**
 * All server actions below re-derive `tenantSlug` and re-check `isAdmin`
 * via `requireAdminContext()` on every call — a client can never supply
 * either. Form actions here intentionally return `Promise<void>` (rather
 * than the `ServerActionResponse<T>` shape used by data-fetching services)
 * to match the React 19 `<form action={fn}>` contract; failures are logged
 * via `safeLog` and re-thrown so Next renders the nearest error boundary —
 * acceptable for an internal admin tool, revisit with inline field errors
 * in a later pass if desired.
 */

/** Parses the users-table's tag editor textarea format: one `key: value` pair per line. */
const parseTagLines = (raw: string): Record<string, string> => {
  const tags: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const [key, ...rest] = line.split(":");
    const trimmedKey = key?.trim();
    const value = rest.join(":").trim();
    if (trimmedKey && value) {
      tags[trimmedKey] = value;
    }
  }
  return tags;
};

export const createUserAction = async (formData: FormData): Promise<void> => {
  await requireAdminContext(); // throws if not admin — never trust the client

  const displayName = String(formData.get("displayName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const role = String(formData.get("role") ?? "user") as UserRole;
  const tags = parseTagLines(String(formData.get("tags") ?? ""));

  if (!displayName || !email) {
    throw new Error("Display name and email are required.");
  }

  const result = await CreateUser({ displayName, email, role, tags });
  if (result.status !== "OK") {
    safeLog.warn("admin.users.create-rejected");
    throw new Error(result.errors[0]?.message ?? "Unable to create user.");
  }

  revalidatePath("/admin/users");
  redirect("/admin/users");
};

export const updateUserAction = async (
  id: string,
  formData: FormData
): Promise<void> => {
  const { tenantSlug } = await requireAdminContext();

  const displayName = String(formData.get("displayName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const role = String(formData.get("role") ?? "user") as UserRole;
  const tags = parseTagLines(String(formData.get("tags") ?? ""));

  const result = await UpdateUser(tenantSlug, id, { displayName, email, role, tags });
  if (result.status !== "OK") {
    throw new Error(result.errors[0]?.message ?? "Unable to update user.");
  }

  revalidatePath("/admin/users");
  redirect("/admin/users");
};

export const setUserStatusAction = async (
  id: string,
  status: UserStatus
): Promise<void> => {
  const { tenantSlug } = await requireAdminContext();
  await SetUserStatus(tenantSlug, id, status);
  revalidatePath("/admin/users");
};

export const setUserRoleAction = async (id: string, role: UserRole): Promise<void> => {
  const { tenantSlug } = await requireAdminContext();
  await UpdateUser(tenantSlug, id, { role });
  revalidatePath("/admin/users");
};

---SPLIT---
"use server";
import "server-only";

import { requireAdminContext } from "@/features/admin/admin-guard";
import {
  AddTagDimension,
  DeleteTagDimension,
  RenameTagDimension,
} from "@/features/admin/group-service";
import { revalidatePath } from "next/cache";

export const addTagDimensionAction = async (formData: FormData): Promise<void> => {
  const { tenantSlug } = await requireAdminContext();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  await AddTagDimension(tenantSlug, name);
  revalidatePath("/admin/groups");
};

export const renameTagDimensionAction = async (
  oldName: string,
  formData: FormData
): Promise<void> => {
  const { tenantSlug } = await requireAdminContext();
  const newName = String(formData.get("newName") ?? "").trim();
  if (!newName) return;

  await RenameTagDimension(tenantSlug, oldName, newName);
  revalidatePath("/admin/groups");
  revalidatePath("/admin/users");
};

export const deleteTagDimensionAction = async (name: string): Promise<void> => {
  const { tenantSlug } = await requireAdminContext();
  await DeleteTagDimension(tenantSlug, name);
  revalidatePath("/admin/groups");
  revalidatePath("/admin/users");
};

exec
/bin/zsh -lc "sed -n '1,240p' src/features/sales-coach/actions/customer-actions.ts" in /Users/hugosson/workspace/SalesPrism
exec
/bin/zsh -lc "sed -n '321,520p' src/features/admin/user-service.ts" in /Users/hugosson/workspace/SalesPrism
 succeeded in 0ms:
"use server";
import "server-only";

import { userHashedId } from "@/features/auth-page/helpers";
import { safeLog } from "@/features/common/services/safe-logger";
import { getCurrentTenantSlug } from "@/features/theme/tenant-resolver";
import { revalidatePath } from "next/cache";
import {
  FindCustomerEntityById,
  UpdateCustomerEntity,
} from "../customer-entity-service";
import { ValueArea, ValueAreaSchema } from "../models";

/**
 * `/customers/[id]` edit-form server actions. Every action re-derives
 * `tenantSlug` + the current seller's `ownerHashedId` from the session —
 * a client can never supply either, matching the `admin/actions/*` pattern.
 */

const parseLines = (raw: string): string[] =>
  raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

const parseValueAreas = (formData: FormData): ValueArea[] => {
  const values = formData.getAll("valueAreas").map(String);
  return values.filter((v): v is ValueArea => ValueAreaSchema.safeParse(v).success);
};

export const updateCustomerProfileAction = async (
  customerId: string,
  formData: FormData
): Promise<void> => {
  const tenantSlug = await getCurrentTenantSlug();
  const ownerHashedId = await userHashedId();

  const customerName = String(formData.get("customerName") ?? "").trim();
  const knownChallenges = parseLines(String(formData.get("knownChallenges") ?? ""));
  const valueAreas = parseValueAreas(formData);

  if (!customerName) {
    throw new Error("Customer name is required.");
  }

  const result = await UpdateCustomerEntity(tenantSlug, ownerHashedId, customerId, {
    customerName,
    knownChallenges,
    valueAreas,
  });

  if (result.status !== "OK") {
    safeLog.warn("sales-coach.customers.update-rejected", { tenantSlug });
    throw new Error(result.errors[0]?.message ?? "Unable to update customer.");
  }

  revalidatePath(`/customers/${customerId}`);
};

/** Edits a single contact's free-text notes (F-03 "Sælger kan se og redigere kundens profil"). */
export const updateContactNotesAction = async (
  customerId: string,
  contactName: string,
  formData: FormData
): Promise<void> => {
  const tenantSlug = await getCurrentTenantSlug();
  const ownerHashedId = await userHashedId();

  const existing = await FindCustomerEntityById(tenantSlug, ownerHashedId, customerId);
  if (existing.status !== "OK") {
    throw new Error(existing.status === "NOT_FOUND" ? "Customer not found." : "Unable to load customer.");
  }

  const notes = String(formData.get("notes") ?? "");
  const updatedContacts = existing.response.contacts.map((contact) =>
    contact.name === contactName ? { ...contact, notes } : contact
  );

  const result = await UpdateCustomerEntity(tenantSlug, ownerHashedId, customerId, {
    contacts: updatedContacts,
  });

  if (result.status !== "OK") {
    safeLog.warn("sales-coach.customers.notes-update-rejected", { tenantSlug });
    throw new Error(result.errors[0]?.message ?? "Unable to update contact notes.");
  }

  revalidatePath(`/customers/${customerId}`);
};

 succeeded in 0ms:
}): Promise<ServerActionResponse<UserAccount>> => {
  try {
    const tenantSlug = await getCurrentTenantSlug();
    const hashedId = hashValue(input.email.trim().toLowerCase());
    const tenantTheme = await GetTenantTheme(tenantSlug);
    const authMethod: UserAuthMethod =
      tenantTheme.status === "OK" ? tenantTheme.response.authMethod : "username-password";

    const now = new Date().toISOString();
    const model: UserAccount = {
      id: userAccountDocId(tenantSlug, hashedId),
      type: USER_ACCOUNT_ATTRIBUTE,
      userId: tenantSlug,
      tenantSlug,
      hashedId,
      displayName: input.displayName,
      email: input.email,
      role: input.role,
      authMethod,
      tags: input.tags,
      createdAt: now,
      lastLoginAt: null,
      status: "active",
      onboardingCompletedAt: null,
    };

    const parsed = UserAccountSchema.safeParse(model);
    if (!parsed.success) {
      return {
        status: "ERROR",
        errors: zodErrorsToServerActionErrors(parsed.error.errors),
      };
    }

    const { resource } = await ConfigContainer().items.create<UserAccount>(parsed.data);
    if (!resource) {
      return { status: "ERROR", errors: [{ message: "Unable to create user." }] };
    }
    return { status: "OK", response: resource };
  } catch (error) {
    const code = (error as { code?: number })?.code;
    safeLog.error("admin.users.create-failed", { statusCode: code });
    if (code === 409) {
      return {
        status: "ERROR",
        errors: [{ message: "A user with this email already exists." }],
      };
    }
    return { status: "ERROR", errors: [{ message: "Unable to create user." }] };
  }
};

export const UpdateUser = async (
  tenantSlug: string,
  id: string,
  patch: Partial<Pick<UserAccount, "displayName" | "email" | "role" | "tags">>
): Promise<ServerActionResponse<UserAccount>> => {
  try {
    const existing = await FindUserById(tenantSlug, id);
    if (existing.status !== "OK") return existing;

    const updated: UserAccount = { ...existing.response, ...patch };
    const parsed = UserAccountSchema.safeParse(updated);
    if (!parsed.success) {
      return {
        status: "ERROR",
        errors: zodErrorsToServerActionErrors(parsed.error.errors),
      };
    }

    const { resource } = await ConfigContainer().items.upsert<UserAccount>(parsed.data);
    if (!resource) {
      return { status: "ERROR", errors: [{ message: "Unable to update user." }] };
    }
    return { status: "OK", response: resource };
  } catch (error) {
    safeLog.error("admin.users.update-failed", { tenantSlug });
    return { status: "ERROR", errors: [{ message: "Unable to update user." }] };
  }
};

export const SetUserStatus = async (
  tenantSlug: string,
  id: string,
  status: UserStatus
): Promise<ServerActionResponse<UserAccount>> => {
  try {
    const existing = await FindUserById(tenantSlug, id);
    if (existing.status !== "OK") return existing;

    const { resource } = await ConfigContainer().items.upsert<UserAccount>({
      ...existing.response,
      status,
    });
    if (!resource) {
      return { status: "ERROR", errors: [{ message: "Unable to update user status." }] };
    }
    return { status: "OK", response: resource };
  } catch (error) {
    safeLog.error("admin.users.set-status-failed", { tenantSlug });
    return { status: "ERROR", errors: [{ message: "Unable to update user status." }] };
  }
};

exec
/bin/zsh -lc "sed -n '1,260p' src/app/'(authenticated)'/customers/page.tsx && printf '\\n---SPLIT---\\n' && sed -n '1,220p' src/app/'(authenticated)'/briefs/page.tsx" in /Users/hugosson/workspace/SalesPrism
 succeeded in 0ms:
import { getSalesCoachActorContext } from "@/features/sales-coach/actor-context";
import { FindCustomerEntitiesForOwner } from "@/features/sales-coach/customer-entity-service";
import { VALUE_AREA_LABELS } from "@/features/sales-coach/models";
import { DisplayError } from "@/features/ui/error/display-error";
import Link from "next/link";

export const dynamic = "force-dynamic";

/**
 * F-03 — `/customers` list route. Per-seller customer intelligence, built
 * automatically from chat via `extraction-service.ts`'s onFinish hook, and
 * editable here (see `/customers/[id]`).
 */
export default async function CustomersPage() {
  const { tenantSlug, ownerHashedId } = await getSalesCoachActorContext();
  const result = await FindCustomerEntitiesForOwner(tenantSlug, ownerHashedId);

  if (result.status !== "OK") {
    return <DisplayError errors={result.errors} />;
  }

  const customers = result.response;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-8 py-8">
      <header>
        <p className="font-mono text-xs uppercase tracking-[0.1em] text-muted-foreground">Coach 360</p>
        <h1 className="font-display text-2xl font-bold text-foreground">Customers</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Automatically built from your conversations with Coach 360 — review and edit anytime.
        </p>
      </header>

      {customers.length === 0 ? (
        <div className="rounded-md border border-border bg-card p-8 text-center text-muted-foreground">
          No customers yet. Mention a customer by name in chat and Coach 360 will start building their profile
          automatically.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {customers.map((customer) => (
            <Link
              key={customer.id}
              href={`/customers/${customer.id}`}
              className="flex flex-col gap-2 rounded-md border border-border bg-card p-5 transition-colors hover:border-primary"
            >
              <div className="flex items-center justify-between">
                <p className="font-display text-lg font-bold text-foreground">{customer.customerName}</p>
                <span className="font-mono text-xs text-muted-foreground">
                  Last interaction {new Date(customer.lastInteraction).toLocaleDateString()}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                {customer.contacts.length} contact{customer.contacts.length === 1 ? "" : "s"} ·{" "}
                {customer.knownChallenges.length} known challenge{customer.knownChallenges.length === 1 ? "" : "s"}
              </p>
              {customer.valueAreas.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {customer.valueAreas.map((v) => (
                    <span
                      key={v}
                      className="rounded-pill bg-secondary px-2 py-0.5 text-xs uppercase tracking-[0.06em] text-secondary-foreground"
                    >
                      {VALUE_AREA_LABELS[v]}
                    </span>
                  ))}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

---SPLIT---
import { getSalesCoachActorContext } from "@/features/sales-coach/actor-context";
import { FindMeetingBriefsForOwner } from "@/features/sales-coach/meeting-brief-service";
import { DisplayError } from "@/features/ui/error/display-error";
import Link from "next/link";

export const dynamic = "force-dynamic";

/**
 * F-01 — `/briefs` list route. "Brief kan gemmes og genåbnes" acceptance
 * criterion: every meeting brief the seller has generated (across all chat
 * threads), reopenable here.
 */
export default async function BriefsPage() {
  const { tenantSlug, ownerHashedId } = await getSalesCoachActorContext();
  const result = await FindMeetingBriefsForOwner(tenantSlug, ownerHashedId);

  if (result.status !== "OK") {
    return <DisplayError errors={result.errors} />;
  }

  const briefs = result.response;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-8 py-8">
      <header>
        <p className="font-mono text-xs uppercase tracking-[0.1em] text-muted-foreground">Coach 360</p>
        <h1 className="font-display text-2xl font-bold text-foreground">Meeting briefs</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every meeting-preparation brief you&apos;ve generated in chat — saved and reopenable anytime.
        </p>
      </header>

      {briefs.length === 0 ? (
        <div className="rounded-md border border-border bg-card p-8 text-center text-muted-foreground">
          No meeting briefs yet. Ask Coach 360 to &ldquo;prepare me for a meeting&rdquo; to get started.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {briefs.map((doc) => (
            <Link
              key={doc.id}
              href={`/briefs/${doc.id}`}
              className="flex items-center justify-between rounded-md border border-border bg-card p-5 transition-colors hover:border-primary"
            >
              <div>
                <p className="font-display text-lg font-bold text-foreground">{doc.brief.customerName}</p>
                <p className="text-sm text-muted-foreground">{doc.brief.meetingTopic}</p>
              </div>
              <span className="font-mono text-xs text-muted-foreground">
                {new Date(doc.createdAt).toLocaleDateString()}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

codex
The admin layer is mostly doing the right thing by re-deriving `tenantSlug` server-side, but I haven’t finished the abuse and privacy paths yet. I’m now tracing speech upload validation, logging, and the chat `onFinish` extraction flow, because those are the highest-risk places for cost amplification and prompt/data leakage.
exec
/bin/zsh -lc "sed -n '1,240p' src/app/'(authenticated)'/api/speech/synthesize/route.ts" in /Users/hugosson/workspace/SalesPrism
exec
/bin/zsh -lc "sed -n '1,260p' src/app/'(authenticated)'/api/speech/transcribe/route.ts" in /Users/hugosson/workspace/SalesPrism
 succeeded in 0ms:
import { userHashedId } from "@/features/auth-page/helpers";
import {
  isDeclaredContentLengthTooLarge,
  MAX_AUDIO_UPLOAD_BYTES,
  validateAudioUpload,
} from "@/features/common/services/audio-validation";
import { isSpeechConfigured, transcribeAudio } from "@/features/common/services/azure-speech";
import { newRequestId, safeLog } from "@/features/common/services/safe-logger";

// Needs `Buffer` + the Speech SDK's Node websocket transport (`ws`) — never
// the edge runtime. Explicit even though `nodejs` is already this route's
// default, so a future framework default change can't silently break it.
export const runtime = "nodejs";

/**
 * STT transcription endpoint — SR-003 remediation (SAD decisions log line
 * 1376). Replaces the deleted `/api/speech/token` + client-side Speech SDK
 * WebSocket: the browser now records locally (see
 * `chat-input/speech/audio-recorder.ts`), uploads the finished WAV blob
 * here over plain HTTPS, and this route is the ONLY thing in the app that
 * talks to Azure Speech for STT — see `azure-speech.ts`'s module doc
 * comment for the full rationale.
 *
 * Session auth: `middleware.ts`'s `requireAuth` matcher already gates every
 * `/api/speech/:path*` request; `userHashedId()` re-checks explicitly here
 * too (defense in depth, same pattern as
 * `api/sales-coach/meeting-briefs/[id]/route.ts`) so this route is never
 * reachable un-authenticated even if the middleware matcher ever changes.
 *
 * Abuse surface: an unauthenticated-looking or oversized upload is
 * rejected as early as possible — `Content-Length` first (before reading
 * any body bytes), then the real `buffer.length` + WAV-duration check once
 * read (`audio-validation.ts` — a client can lie about/omit
 * `Content-Length`, so that header check is a fast-path only, never the
 * sole guard).
 */
export async function POST(req: Request): Promise<Response> {
  const requestId = newRequestId();

  try {
    await userHashedId();
  } catch {
    return Response.json(
      { error: true, code: "unauthorized", message: "Sign in required." },
      { status: 401 }
    );
  }

  const contentLengthHeader = req.headers.get("content-length");
  if (contentLengthHeader && isDeclaredContentLengthTooLarge(Number(contentLengthHeader))) {
    return Response.json(
      {
        error: true,
        code: "audio_too_large",
        message: `Recording exceeds the ${Math.floor(MAX_AUDIO_UPLOAD_BYTES / (1024 * 1024))}MB limit.`,
      },
      { status: 413 }
    );
  }

  if (!isSpeechConfigured()) {
    return Response.json(
      {
        error: true,
        code: "speech_not_configured",
        message: "Voice input isn't available for this workspace yet.",
      },
      { status: 503 }
    );
  }

  let buffer: Buffer;
  try {
    const arrayBuffer = await req.arrayBuffer();
    buffer = Buffer.from(arrayBuffer);
  } catch {
    return Response.json(
      { error: true, code: "invalid_body", message: "Unable to read the uploaded audio." },
      { status: 400 }
    );
  }

  const validation = validateAudioUpload(buffer);
  if (!validation.ok) {
    return Response.json(
      { error: true, code: validation.code, message: validation.message },
      { status: validation.status }
    );
  }

  try {
    const result = await transcribeAudio(buffer);
    if (result.outcome === "no-match") {
      return Response.json({ error: false, text: "", noSpeechDetected: true });
    }
    return Response.json({ error: false, text: result.text });
  } catch {
    // Never log the raw SDK error — same convention as safe-logger.ts's
    // other call sites — a Speech SDK cancellation error can carry
    // diagnostic detail (endpoint, connection id) that shouldn't land in
    // Application Insights.
    safeLog.error("speech.transcribe-failed", { requestId });
    return Response.json(
      { error: true, code: "speech_transcribe_error", message: "Unable to transcribe audio." },
      { status: 500 }
    );
  }
}

 succeeded in 0ms:
import { userHashedId } from "@/features/auth-page/helpers";
import { isSpeechConfigured, synthesizeSpeech } from "@/features/common/services/azure-speech";
import { newRequestId, safeLog } from "@/features/common/services/safe-logger";

export const runtime = "nodejs"; // needs the Speech SDK's Node websocket transport — never edge

/**
 * TTS synthesis endpoint — SR-003 remediation follow-through. The (now
 * deleted) `/api/speech/token` route was shared by both STT and TTS: the
 * client-side Speech SDK used it to open a browser<->Azure WebSocket for
 * *both* directions (mic audio up, synthesized audio down). Deleting that
 * shared token path to fix STT would otherwise have left TTS silently
 * broken, so playback is proxied the same way: this route calls Azure
 * Speech server-side and returns finished MP3 bytes; the client
 * (`use-text-to-speech.ts`) just plays them via a plain `<audio>` element —
 * no Azure SDK import, no token, no direct connection from the browser.
 *
 * Auth: same defense-in-depth as `transcribe/route.ts` — `middleware.ts`
 * already gates `/api/speech/:path*`, `userHashedId()` re-checks here too.
 */
export async function POST(req: Request): Promise<Response> {
  const requestId = newRequestId();

  try {
    await userHashedId();
  } catch {
    return Response.json(
      { error: true, code: "unauthorized", message: "Sign in required." },
      { status: 401 }
    );
  }

  if (!isSpeechConfigured()) {
    return Response.json(
      {
        error: true,
        code: "speech_not_configured",
        message: "Voice output isn't available for this workspace yet.",
      },
      { status: 503 }
    );
  }

  // App-level abuse guard, not an Azure Speech service limit — TTS is only
  // ever invoked here on a single assistant chat message, never arbitrary
  // user-supplied bulk text.
  const MAX_TTS_CHARACTERS = 4000;

  let text: string;
  try {
    const body = (await req.json()) as { text?: unknown };
    if (typeof body.text !== "string" || body.text.trim().length === 0) {
      return Response.json(
        { error: true, code: "missing_text", message: "text is required." },
        { status: 400 }
      );
    }
    text = body.text.slice(0, MAX_TTS_CHARACTERS);
  } catch {
    return Response.json(
      { error: true, code: "invalid_body", message: "Expected a JSON body with text." },
      { status: 400 }
    );
  }

  try {
    const audio = await synthesizeSpeech(text);
    return new Response(audio, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    safeLog.error("speech.synthesize-failed", { requestId });
    return Response.json(
      { error: true, code: "speech_synthesize_error", message: "Unable to synthesize speech." },
      { status: 500 }
    );
  }
}

exec
/bin/zsh -lc "sed -n '1,220p' src/app/'(authenticated)'/api/speech/cleanup/route.ts" in /Users/hugosson/workspace/SalesPrism
exec
/bin/zsh -lc "sed -n '1,260p' src/features/common/services/audio-validation.ts" in /Users/hugosson/workspace/SalesPrism
 succeeded in 0ms:
import { cleanupSttTranscript } from "@/features/sales-coach/stt-cleanup";
import { newRequestId, safeLog } from "@/features/common/services/safe-logger";

/**
 * STT post-processing endpoint — backlog F-02. One call, kept fast (single
 * `generateObject` round-trip, see stt-cleanup.ts). Always returns 200 with
 * usable text: a cleanup failure falls back to the raw transcript rather
 * than erroring, so the seller is never blocked by this best-effort step.
 *
 * Excluded from the PWA service worker (next.config.js `/api/speech`
 * NetworkOnly rule) — this is a one-shot POST, never meant to be replayed
 * from cache.
 */
export async function POST(req: Request): Promise<Response> {
  const requestId = newRequestId();

  let rawText: string;
  try {
    const body = (await req.json()) as { rawText?: unknown };
    if (typeof body.rawText !== "string" || body.rawText.trim().length === 0) {
      return Response.json(
        { error: true, code: "missing_raw_text", message: "rawText is required." },
        { status: 400 }
      );
    }
    rawText = body.rawText;
  } catch {
    return Response.json(
      { error: true, code: "invalid_body", message: "Expected a JSON body with rawText." },
      { status: 400 }
    );
  }

  try {
    const result = await cleanupSttTranscript(rawText);
    return Response.json({ error: false, ...result });
  } catch {
    // cleanupSttTranscript already falls back internally on model failure —
    // this only guards against something unexpected (e.g. a serialization
    // bug), and still degrades to the raw transcript rather than a hard error.
    safeLog.error("speech.cleanup-route-failed", { requestId });
    return Response.json({ error: false, category: "free-chat", cleanedText: rawText });
  }
}

 succeeded in 0ms:
/**
 * Pure validation for STT audio uploads (SR-003 remediation,
 * docs/Sales_Prism_SAD_v2.7.md decisions log line 1376). No Azure/network
 * dependency — this is the "abuse surface" guard the
 * `/api/speech/transcribe` route runs BEFORE ever calling Azure Speech, so
 * it is deliberately kept dependency-free and unit-testable in isolation.
 *
 * The server only ever accepts a mono, uncompressed PCM WAV file (see
 * `wav-encoder.ts` on the client, which always produces exactly this
 * format before upload) — never a compressed container (webm/opus, mp4,
 * ogg). That keeps this parser simple and keeps the server from ever
 * needing a codec/GStreamer dependency that isn't verified as available on
 * the Azure App Service Linux Node runtime.
 */

/** 10MB — generous for a ~2 minute mono 16-bit/16kHz WAV recording (see MAX_AUDIO_DURATION_SECONDS), tight enough to bound a single abusive upload. */
export const MAX_AUDIO_UPLOAD_BYTES = 10 * 1024 * 1024;

/** 2 minutes — long enough to dictate a meeting update or customer observation, short enough to bound both abuse and Azure Speech per-call cost. */
export const MAX_AUDIO_DURATION_SECONDS = 120;

/** RIFF header (12 bytes) + at least one 8-byte chunk header. */
const MIN_WAV_HEADER_BYTES = 20;

/** WAVE_FORMAT_PCM — the only `fmt ` audioFormat this server accepts. */
const WAVE_FORMAT_PCM = 1;

export type WavHeaderInfo = {
  sampleRate: number;
  numChannels: number;
  bitsPerSample: number;
  /** Bytes of actual audio payload (the `data` chunk), clamped to what's actually present in the buffer. */
  dataSize: number;
  durationSeconds: number;
};

export type AudioValidationErrorCode =
  | "audio_empty"
  | "audio_too_large"
  | "audio_invalid_format"
  | "audio_too_long";

export type AudioValidationError = {
  ok: false;
  status: 400 | 413;
  code: AudioValidationErrorCode;
  message: string;
};

export type AudioValidationResult = { ok: true; header: WavHeaderInfo } | AudioValidationError;

/**
 * Parses a RIFF/WAVE header and locates the `fmt ` and `data` chunks.
 * Returns `null` for anything that isn't a well-formed, uncompressed PCM
 * WAV buffer — malformed input, a compressed `fmt ` tag (webm/opus, mp3,
 * ...), or a truncated/missing `data` chunk.
 *
 * Duration is derived independently from the parsed sample rate / bit
 * depth / channel count and the *actual* number of bytes present — a
 * client-declared duration is never trusted.
 */
export const parseWavHeader = (buffer: Buffer): WavHeaderInfo | null => {
  if (buffer.length < MIN_WAV_HEADER_BYTES) return null;
  if (buffer.toString("ascii", 0, 4) !== "RIFF") return null;
  if (buffer.toString("ascii", 8, 12) !== "WAVE") return null;

  let offset = 12;
  let fmt:
    | { audioFormat: number; numChannels: number; sampleRate: number; bitsPerSample: number }
    | null = null;
  let dataSize: number | null = null;

  // Chunks are word-aligned (padded to an even byte count); walk them
  // until we've found both `fmt ` and `data`, or run out of buffer.
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;

    if (chunkId === "fmt " && chunkStart + 16 <= buffer.length) {
      fmt = {
        audioFormat: buffer.readUInt16LE(chunkStart),
        numChannels: buffer.readUInt16LE(chunkStart + 2),
        sampleRate: buffer.readUInt32LE(chunkStart + 4),
        bitsPerSample: buffer.readUInt16LE(chunkStart + 14),
      };
    }

    if (chunkId === "data") {
      // Some encoders write a placeholder/streaming size larger than what's
      // actually present (or 0xFFFFFFFF) — clamp to the real buffer length
      // so duration is always derived from bytes that actually exist.
      dataSize = Math.max(0, Math.min(chunkSize, buffer.length - chunkStart));
      break; // `data` is always the last chunk we need
    }

    if (chunkSize < 0) return null; // corrupt/overflowed size
    offset = chunkStart + chunkSize + (chunkSize % 2);
  }

  if (!fmt || dataSize === null) return null;
  if (fmt.audioFormat !== WAVE_FORMAT_PCM) return null;
  if (fmt.sampleRate <= 0 || fmt.numChannels <= 0 || fmt.bitsPerSample <= 0) return null;

  const byteRate = fmt.sampleRate * fmt.numChannels * (fmt.bitsPerSample / 8);
  const durationSeconds = byteRate > 0 ? dataSize / byteRate : 0;

  return {
    sampleRate: fmt.sampleRate,
    numChannels: fmt.numChannels,
    bitsPerSample: fmt.bitsPerSample,
    dataSize,
    durationSeconds,
  };
};

/**
 * The single validation gate `/api/speech/transcribe` runs before ever
 * calling Azure Speech. Order matters: cheap checks (size) before more
 * expensive parsing, and every rejection carries the HTTP status the route
 * should return verbatim — 413 for "the upload/recording is too big or too
 * long" (an abuse surface), 400 for "this isn't audio we can use".
 */
export const validateAudioUpload = (buffer: Buffer): AudioValidationResult => {
  if (buffer.length === 0) {
    return { ok: false, status: 400, code: "audio_empty", message: "No audio was received." };
  }

  if (buffer.length > MAX_AUDIO_UPLOAD_BYTES) {
    return {
      ok: false,
      status: 413,
      code: "audio_too_large",
      message: `Recording exceeds the ${Math.floor(MAX_AUDIO_UPLOAD_BYTES / (1024 * 1024))}MB limit.`,
    };
  }

  const header = parseWavHeader(buffer);
  if (!header) {
    return {
      ok: false,
      status: 400,
      code: "audio_invalid_format",
      message: "Expected a mono PCM WAV recording.",
    };
  }

  if (header.durationSeconds > MAX_AUDIO_DURATION_SECONDS) {
    return {
      ok: false,
      status: 413,
      code: "audio_too_long",
      message: `Recording exceeds the ${MAX_AUDIO_DURATION_SECONDS}s limit.`,
    };
  }

  return { ok: true, header };
};

/**
 * Fast pre-body-read rejection using the `Content-Length` header alone —
 * lets the route return 413 without ever buffering a multi-hundred-MB
 * upload into memory. This is a *hint*, not the source of truth: the real
 * enforcement is `validateAudioUpload`'s own `buffer.length` check once the
 * body has actually been read (a client can lie about or omit
 * `Content-Length`).
 */
export const isDeclaredContentLengthTooLarge = (contentLength: number): boolean =>
  Number.isFinite(contentLength) && contentLength > MAX_AUDIO_UPLOAD_BYTES;

exec
/bin/zsh -lc "sed -n '1,320p' src/features/common/services/azure-speech.ts" in /Users/hugosson/workspace/SalesPrism
 succeeded in 0ms:
import "server-only";

import { DefaultAzureCredential, getBearerTokenProvider } from "@azure/identity";
import {
  AudioConfig,
  AutoDetectSourceLanguageConfig,
  ResultReason,
  SpeechConfig,
  SpeechRecognizer,
  SpeechSynthesisOutputFormat,
  SpeechSynthesizer,
} from "microsoft-cognitiveservices-speech-sdk";

/**
 * Azure AI Speech (STT + TTS) — server-side only, per
 * docs/Sales_Prism_SAD_v2.7.md decisions log line 1376: "Azure AI Speech
 * Service ... Implementeres som proxy via Next.js API route (audio ALDRIG
 * direkte til Azure fra browser). Web Speech API fravalgt — audio routes
 * til Google/Apple-servere (GDPR-brud)."
 *
 * SR-003 REMEDIATION (2026-07-30): a prior Phase F implementation issued a
 * Microsoft Entra ID-backed Speech authorization token to the browser
 * (`/api/speech/token`, now deleted) and opened a browser<->Azure WebSocket
 * directly from the seller's laptop via the client-side Speech SDK. That
 * contradicted the SAD-mandated proxy above. A prior escalation framed the
 * fix as an infra gap — "the Speech account needs `publicNetworkAccess:
 * Enabled`" — and that framing was WRONG; do not revisit it.
 * `infra/modules/speech.bicep`'s `publicNetworkAccess: 'Disabled'` is
 * CORRECT and stays exactly as-is: a customer's Private Endpoint is
 * deliberately unreachable from outside that customer's VNet, and an
 * external seller's browser was never supposed to be able to reach it —
 * that unreachability IS the control, not a bug to route around.
 *
 * The actual fix is entirely on the app side: every call into Azure Speech
 * now originates from THIS server module, which runs inside the
 * VNet-integrated App Service (`vnetRouteAllEnabled: true` — see
 * infra/modules/speech.bicep / the App Service network config), and which
 * therefore CAN reach the Private Endpoint. The browser only ever talks to
 * this app's own Route Handlers (`/api/speech/transcribe`,
 * `/api/speech/synthesize`) over plain same-origin HTTPS — it never holds
 * an Azure credential or a Speech Service token, and never opens a
 * WebSocket to `*.cognitiveservices.azure.com` / `*.speech.microsoft.com`
 * itself. See `transcribeAudio` / `synthesizeSpeech` below, and the client
 * callers in `chat-input/speech/audio-recorder.ts` (STT) and
 * `chat-input/speech/use-text-to-speech.ts` (TTS) — neither imports
 * `microsoft-cognitiveservices-speech-sdk` at all anymore.
 *
 * Zero-secrets (CLAUDE.md / SAD R3): `AZURE_SPEECH_KEY` (subscription key)
 * must NEVER be read here or anywhere else in this app —
 * `DefaultAzureCredential` (managed identity) only, same as `azure-ai.ts` /
 * `document-intelligence.ts`.
 *
 * Env var contract (all three set together by infra/modules/speech.bicep):
 *  - `AZURE_SPEECH_REGION` (required) — e.g. "westeurope".
 *  - `AZURE_SPEECH_RESOURCE_ID` (required) — the full ARM resource id of
 *    the Speech resource. Required to compose the Speech SDK's
 *    "aad#<resourceId>#<AAD token>" authorization-token format (see
 *    `buildServerSpeechConfig` below) — a bare AAD bearer token is not
 *    sufficient on its own for this SDK.
 *  - `AZURE_SPEECH_ENDPOINT` (required) — the Speech account's own
 *    custom-subdomain endpoint. `SpeechConfig.fromEndpoint(new
 *    URL(endpoint), "")` + `.authorizationToken = token` is the SDK's own
 *    documented pattern for combining a custom endpoint with token auth
 *    (the region-only `fromAuthorizationToken` constructor builds a
 *    generic `wss://{region}.stt.speech.microsoft.com` endpoint that does
 *    not resolve for a custom-subdomain account) — this is used as a
 *    fallback only, for backward compatibility with an older deployment
 *    that predates this env var.
 *
 * Until these env vars are set at all (Speech resource not yet provisioned
 * for a given customer), `isSpeechConfigured()` returns `false` and both
 * routes degrade to a 503 rather than erroring — see
 * `speech-availability-context.tsx`, which hides/disables the mic button
 * before either route is ever called.
 */

const SPEECH_AAD_SCOPE = "https://cognitiveservices.azure.com/.default";

/**
 * Sales Coach 360 languages (backlog F-02 §"Teknisk implementation"):
 * dansk, norsk, svensk, engelsk, tysk — this platform's actual Nordic B2B
 * customer languages. Same list previously used by the (now deleted)
 * client-side recognizer, now used server-side for auto language
 * detection.
 */
const SUPPORTED_SPEECH_LANGUAGES = ["da-DK", "nb-NO", "sv-SE", "en-US", "de-DE"];

/**
 * How long a single-utterance recognize/synthesize call may run before
 * this module gives up and surfaces an error — guards against a stalled
 * Azure Speech WebSocket ever hanging a Route Handler request
 * indefinitely.
 */
const SPEECH_CALL_TIMEOUT_MS = 20_000;

export const isSpeechConfigured = (): boolean =>
  Boolean(process.env.AZURE_SPEECH_REGION && process.env.AZURE_SPEECH_RESOURCE_ID);

let cachedTokenProvider: (() => Promise<string>) | undefined;

const getTokenProvider = (): (() => Promise<string>) => {
  if (cachedTokenProvider) return cachedTokenProvider;
  const credential = new DefaultAzureCredential();
  cachedTokenProvider = getBearerTokenProvider(credential, SPEECH_AAD_SCOPE);
  return cachedTokenProvider;
};

/**
 * Builds a server-side `SpeechConfig` authenticated via
 * `DefaultAzureCredential`. This value never leaves this process — no
 * Route Handler in this app ever serializes a `SpeechConfig`, an
 * authorization token, or any Azure credential back to the client (see the
 * module doc comment above).
 */
const buildServerSpeechConfig = async (): Promise<SpeechConfig> => {
  const resourceId = process.env.AZURE_SPEECH_RESOURCE_ID!;
  const region = process.env.AZURE_SPEECH_REGION!;
  const endpoint = process.env.AZURE_SPEECH_ENDPOINT || null;
  const tokenProvider = getTokenProvider();
  const aadToken = await tokenProvider();
  const authorizationToken = `aad#${resourceId}#${aadToken}`;

  if (endpoint) {
    const speechConfig = SpeechConfig.fromEndpoint(new URL(endpoint), "");
    speechConfig.authorizationToken = authorizationToken;
    return speechConfig;
  }

  return SpeechConfig.fromAuthorizationToken(authorizationToken, region);
};

const withTimeout = <T>(promise: Promise<T>, label: string): Promise<T> =>
  Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      const timer = setTimeout(() => reject(new Error(`${label} timed out`)), SPEECH_CALL_TIMEOUT_MS);
      // Never keep the Node process alive solely for this guard timer.
      if (typeof timer === "object" && "unref" in timer) (timer as NodeJS.Timeout).unref();
    }),
  ]);

export type TranscribeOutcome = { outcome: "recognized"; text: string } | { outcome: "no-match" };

/**
 * Maps a raw speech-recognition result to an app-level outcome. Extracted
 * as a standalone pure function — takes only primitives/the `ResultReason`
 * enum, not a live SDK recognizer/result object — so it is unit-testable
 * without opening a real WebSocket connection to Azure.
 */
export const mapRecognitionOutcome = (
  reason: ResultReason,
  text: string,
  errorDetails?: string
): TranscribeOutcome => {
  if (reason === ResultReason.RecognizedSpeech) {
    return { outcome: "recognized", text };
  }
  if (reason === ResultReason.NoMatch) {
    return { outcome: "no-match" };
  }
  throw new Error(errorDetails || `Unexpected speech recognition result: ${ResultReason[reason]}`);
};

/**
 * Transcribes a single pre-recorded utterance. `wavBuffer` MUST be a mono
 * uncompressed PCM WAV file (see `audio-validation.ts` /
 * `chat-input/speech/wav-encoder.ts`).
 *
 * `AudioConfig.fromWavFileInput(Buffer)` is the verified, Node-compatible
 * entry point for this SDK version — checked directly against the
 * installed `microsoft-cognitiveservices-speech-sdk@1.34.0` type
 * declarations (`distrib/lib/src/sdk/Audio/AudioConfig.d.ts`) and smoke
 * tested against a real Node `require()` of the package before this file
 * was written (see PR description). Compressed formats (webm/opus, mp4,
 * ...) are deliberately never sent here — decoding them server-side via
 * this SDK requires a GStreamer install that is not verified as available
 * on the Azure App Service Linux Node runtime; the browser already
 * decodes+re-encodes to WAV before upload (`audio-recorder.ts`), so this
 * server module never needs that dependency at all.
 */
export const transcribeAudio = async (wavBuffer: Buffer): Promise<TranscribeOutcome> => {
  const speechConfig = await buildServerSpeechConfig();
  const audioConfig = AudioConfig.fromWavFileInput(wavBuffer);
  const autoDetectSourceLanguageConfig =
    AutoDetectSourceLanguageConfig.fromLanguages(SUPPORTED_SPEECH_LANGUAGES);
  const recognizer = SpeechRecognizer.FromConfig(
    speechConfig,
    autoDetectSourceLanguageConfig,
    audioConfig
  );

  try {
    const result = await withTimeout(
      new Promise<{ reason: ResultReason; text: string; errorDetails?: string }>(
        (resolve, reject) => {
          recognizer.recognizeOnceAsync(
            (r) => resolve({ reason: r.reason, text: r.text, errorDetails: r.errorDetails }),
            (err) => reject(new Error(err))
          );
        }
      ),
      "Speech recognition"
    );

    return mapRecognitionOutcome(result.reason, result.text, result.errorDetails);
  } finally {
    recognizer.close();
  }
};

/**
 * Synthesizes `text` to MP3 audio bytes, entirely server-side. Passing no
 * `AudioConfig` to `SpeechSynthesizer` (verified against
 * `distrib/lib/src/sdk/SpeechSynthesizer.d.ts` and
 * `SpeechSynthesisResult.d.ts`, and smoke tested with a real Node
 * `require()`) is the SDK's documented way to receive the synthesized
 * audio as an in-memory `ArrayBuffer` (`result.audioData`) instead of
 * attempting to play it to a system speaker device — which doesn't exist
 * on an App Service instance and would otherwise throw.
 */
export const synthesizeSpeech = async (text: string): Promise<Buffer> => {
  const speechConfig = await buildServerSpeechConfig();
  speechConfig.speechSynthesisOutputFormat = SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3;
  const synthesizer = new SpeechSynthesizer(speechConfig);

  try {
    const result = await withTimeout(
      new Promise<{ reason: ResultReason; audioData: ArrayBuffer; errorDetails?: string }>(
        (resolve, reject) => {
          synthesizer.speakTextAsync(
            text,
            (r) => resolve({ reason: r.reason, audioData: r.audioData, errorDetails: r.errorDetails }),
            (err) => reject(new Error(err))
          );
        }
      ),
      "Speech synthesis"
    );

    if (result.reason !== ResultReason.SynthesizingAudioCompleted) {
      throw new Error(result.errorDetails || "Speech synthesis did not complete.");
    }

    return Buffer.from(result.audioData);
  } finally {
    synthesizer.close();
  }
};

exec
/bin/zsh -lc "sed -n '1,260p' src/features/common/services/safe-logger.ts" in /Users/hugosson/workspace/SalesPrism
 succeeded in 0ms:
import "server-only";

/**
 * safe-logger — Codex review #1 finding 7 (MEDIUM) remediation.
 *
 * The chat handler previously did `console.error("...", error)` /
 * `console.error("...", errors)` with raw SDK error objects and
 * ServerActionError arrays. This app is prewired to Application Insights
 * (infra/modules/observability.bicep), so anything written to
 * console.error/warn/info in production is customer telemetry — and those
 * raw objects routinely carry prompt text, document filenames, AI Search
 * OData filters, and sometimes retrieved chunk content. That is PII/customer
 * data leaking into logs with no minimization.
 *
 * `safeLog` is the only logging entry point this app should use for
 * anything touching a chat request, a document, or a tenant lookup. It
 * accepts nothing but a stable event code plus an explicit allow-list of
 * "known-safe" fields — there is no parameter for a raw `Error`, `unknown`,
 * or free-form message string, so a caller physically cannot pass prompt
 * text or file content through it by accident.
 *
 * If you need a new field, add it to `SafeLogFields` deliberately and
 * confirm it can never contain user-authored content (prompts, filenames,
 * document text, search filters, emails, display names) before doing so.
 */

export type SafeLogFields = Partial<{
  /** Correlation id for this request — see `newRequestId()`. Never a user id or session token. */
  requestId: string;
  /** Tenant slug (SAD §5.3) — not customer-identifying beyond what's already in the hostname. */
  tenantSlug: string;
  /** Cosmos chat-thread id (opaque nanoid) — not user-authored content. */
  chatThreadId: string;
  /** SHA-256 hash of the user's email (see `userHashedId()`) — never the raw email/name. */
  userId: string;
  /** HTTP-ish status code, e.g. 401 / 404 / 500. */
  statusCode: number;
  /** A plain count (documents found, users listed, rows exported, etc). */
  count: number;
  /** Elapsed time in milliseconds. */
  durationMs: number;
  /** Activity/event type discriminator, e.g. "prompt" | "login" | "upload". */
  eventType: string;
  /** A stable, developer-defined error code — never an interpolated Error/exception message. */
  errorCode: string;
  /** Model-router (SAD §18 Phase F) classified query complexity — "low" | "medium" | "high", never prompt text. */
  complexity: string;
  /** Model-router deployment name actually used to serve the request — a config value, never prompt/response text. */
  deploymentUsed: string;
  /** Total tokens (prompt + completion) reported by the Vercel AI SDK's `onFinish` usage — a count, never token content. */
  tokensUsed: number;
}>;

const SAFE_FIELD_KEYS: Array<keyof SafeLogFields> = [
  "requestId",
  "tenantSlug",
  "chatThreadId",
  "userId",
  "statusCode",
  "count",
  "durationMs",
  "eventType",
  "errorCode",
  "complexity",
  "deploymentUsed",
  "tokensUsed",
];

const sanitizeFields = (fields?: SafeLogFields): Record<string, unknown> => {
  if (!fields) return {};
  const out: Record<string, unknown> = {};
  for (const key of SAFE_FIELD_KEYS) {
    const value = fields[key];
    if (value !== undefined) out[key] = value;
  }
  return out;
};

const emit = (
  level: "error" | "warn" | "info",
  code: string,
  fields?: SafeLogFields
): void => {
  const payload = { code, ...sanitizeFields(fields) };
  // eslint-disable-next-line no-console -- this IS the logging boundary; every
  // other call site in the app should go through safeLog instead of console.*.
  console[level](JSON.stringify(payload));
};

export const safeLog = {
  error: (code: string, fields?: SafeLogFields): void => emit("error", code, fields),
  warn: (code: string, fields?: SafeLogFields): void => emit("warn", code, fields),
  info: (code: string, fields?: SafeLogFields): void => emit("info", code, fields),
};

/**
 * Lightweight, dependency-free correlation id for tying a user-facing error
 * message ("Something went wrong — reference req_xxx") back to the
 * corresponding `safeLog` line, without ever needing to log the underlying
 * error content itself.
 */
export const newRequestId = (): string => {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `req_${globalThis.crypto.randomUUID()}`;
  }
  return `req_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
};

exec
/bin/zsh -lc "sed -n '1,320p' src/features/sales-coach/structured-output.ts" in /Users/hugosson/workspace/SalesPrism
exec
/bin/zsh -lc "sed -n '1,320p' src/features/sales-coach/extraction-service.ts" in /Users/hugosson/workspace/SalesPrism
exec
/bin/zsh -lc "sed -n '1,260p' src/features/sales-coach/stt-cleanup.ts" in /Users/hugosson/workspace/SalesPrism
exec
/bin/zsh -lc "sed -n '1,320p' src/features/sales-coach/context-injection.ts" in /Users/hugosson/workspace/SalesPrism
 succeeded in 0ms:
import "server-only";

import { getChatModel } from "@/features/common/services/azure-ai";
import { generateObject } from "ai";
import { z } from "zod";
import {
  MeetingBrief,
  MeetingBriefSchema,
  OrgLevelSchema,
  PERSONA_TYPE_LABELS,
  PersonaType,
  PersonaTypeSchema,
  ValueArea,
  ValueAreaSchema,
} from "./models";
import { SALES_COACH_MODULE_REGISTRY } from "./context-injection";

/**
 * Structured Output — SHARED 3 (backlog "Tekniske Fælles-komponenter").
 * Used by F-01, F-04 (and F-05 in a later phase).
 *
 * Every helper here uses `generateObject` (non-streaming) against the
 * Standard-tier chat deployment via `getChatModel()` — the same
 * `AZURE_OPENAI_CHAT_DEPLOYMENT` env contract `chat-handler.ts` already
 * uses for `streamText`, per CLAUDE.md ("No API keys anywhere" /
 * DefaultAzureCredential — `azure-ai.ts` already enforces this, nothing
 * new is introduced here).
 */

// ---------------------------------------------------------------------------
// MeetingBrief — F-01
// ---------------------------------------------------------------------------

const MEETING_BRIEF_SYSTEM_PROMPT = `Du er en Sales Coach 360 mødeforberedelses-motor. Generér et struktureret møde-brief baseret udelukkende på den information sælgeren har givet.

Anvend disse Sales Coach-modeller:
- ${SALES_COACH_MODULE_REGISTRY["module-01"].name}: ${SALES_COACH_MODULE_REGISTRY["module-01"].essence}
- ${SALES_COACH_MODULE_REGISTRY["module-02"].name}: ${SALES_COACH_MODULE_REGISTRY["module-02"].essence}
- ${SALES_COACH_MODULE_REGISTRY["module-04"].name}: ${SALES_COACH_MODULE_REGISTRY["module-04"].essence}

Krav:
- "openingQuestions" skal være konkrete 2nd Position-spørgsmål (fokuserer på kundens verden, ikke egne produkter) — mindst 2.
- "valueAreaThemes" skal pege på de value areas der er mest relevante ud fra det sælgeren har delt, med en impact-vurdering.
- "discoveryQuestionsByPersona" skal give konkrete spørgsmål per nævnt/kendt persona-type.
- "framing" skal vælge enten "burning-platform" (akut problem der presser på) eller "burning-ambition" (fremadrettet mulighed), afhængigt af hvad der passer bedst til den delte kontekst.
- Opfind ikke fakta om kunden — brug kun det der er blevet delt eller er en rimelig, tydeligt markeret antagelse.`;

export type GenerateMeetingBriefInput = {
  customerName: string;
  meetingTopic: string;
  /** Synthesis of the guided 360° Q&A (vision/strategy, attendees & roles, challenges, value areas). */
  conversationContext: string;
  /** Optional known customer intel (F-03) to ground the brief in prior history instead of re-asking. */
  existingCustomerSummary?: string;
};

export const generateMeetingBrief = async (
  input: GenerateMeetingBriefInput
): Promise<MeetingBrief> => {
  const prompt = [
    `Kunde: ${input.customerName}`,
    `Møde-emne: ${input.meetingTopic}`,
    `Sælgerens input fra den guidede forberedelse:\n${input.conversationContext}`,
    input.existingCustomerSummary
      ? `Kendt kunde-historik (brug proaktivt, spørg ikke om det igen):\n${input.existingCustomerSummary}`
      : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const { object } = await generateObject({
    model: getChatModel(),
    schema: MeetingBriefSchema,
    system: MEETING_BRIEF_SYSTEM_PROMPT,
    prompt,
  });

  return object;
};

// ---------------------------------------------------------------------------
// CustomerInsightExtraction — F-03
// ---------------------------------------------------------------------------

export const CustomerInsightExtractionSchema = z.object({
  /** `null` when no customer/account is confidently identifiable in this exchange. */
  customerName: z.string().nullable(),
  customerNameConfidence: z.enum(["high", "medium", "low"]),
  newContacts: z
    .array(
      z.object({
        name: z.string(),
        title: z.string().nullable(),
      })
    )
    .default([]),
  newChallenges: z.array(z.string()).default([]),
  newTriggers: z.array(z.string()).default([]),
  mentionedValueAreas: z.array(ValueAreaSchema).default([]),
});
export type CustomerInsightExtraction = z.infer<typeof CustomerInsightExtractionSchema>;

const CUSTOMER_INSIGHT_SYSTEM_PROMPT = `Du udtrækker struktureret kunde-intelligens fra én chat-udveksling mellem en sælger og en AI-salgscoach — for at bygge en vedvarende kunde-profil (aldrig for at besvare brugeren).

Regler:
- Sæt kun "customerName" hvis et konkret kunde/virksomhedsnavn er nævnt — ikke en generisk beskrivelse som "min kunde".
- "customerNameConfidence" = "high" kun hvis navnet er utvetydigt og gentages/bekræftes i konteksten; ellers "medium" eller "low".
- "newContacts" skal kun indeholde personer med et navn — udelad rene rolle-omtaler uden navn.
- Udtræk kun information der faktisk blev sagt — opfind intet.
- Er der ingen kunde-relevant information i udvekslingen, returér null/tomme lister.`;

export const extractCustomerInsights = async (input: {
  userMessage: string;
  assistantMessage: string;
}): Promise<CustomerInsightExtraction> => {
  const { object } = await generateObject({
    model: getChatModel(),
    schema: CustomerInsightExtractionSchema,
    system: CUSTOMER_INSIGHT_SYSTEM_PROMPT,
    prompt: `Sælger:\n${input.userMessage}\n\nAI-salgscoach:\n${input.assistantMessage}`,
  });

  return object;
};

// ---------------------------------------------------------------------------
// PersonaClassification — F-04
// ---------------------------------------------------------------------------

export const PersonaClassificationSchema = z.object({
  name: z.string(),
  title: z.string(),
  orgLevel: OrgLevelSchema,
  personaType: PersonaTypeSchema,
  primaryValueArea: ValueAreaSchema,
  secondaryValueArea: ValueAreaSchema.nullable(),
  knownTriggers: z.array(z.string()).default([]),
  communicationTips: z.array(z.string()).min(1),
  suggestedQuestions: z.array(z.string()).min(1),
});
export type PersonaClassification = z.infer<typeof PersonaClassificationSchema>;

const PERSONA_CLASSIFICATION_SYSTEM_PROMPT = `Du klassificerer en navngiven stakeholder i Sales Coach Personas & Stakeholder Model-terminologi, ud fra hvad sælgeren har delt om personen.

Gyldige persona-typer: ${Object.entries(PERSONA_TYPE_LABELS)
  .map(([key, label]) => `${key} (${label})`)
  .join(", ")}.

Regler:
- Vælg "orgLevel" og "personaType" ud fra titel + kontekst (fx en IT-direktør er typisk "tactical", en CFO/CEO typisk "strategic").
- "communicationTips" og "suggestedQuestions" skal være konkrete og handlingsrettede — mindst ét hver.
- Gæt ikke på fakta der ikke er nævnt — men du MÅ udlede en rimelig persona-klassificering fra titel + kontekst, det er selve opgaven.`;

export const classifyPersona = async (input: {
  name: string;
  title: string;
  context: string;
}): Promise<PersonaClassification> => {
  const { object } = await generateObject({
    model: getChatModel(),
    schema: PersonaClassificationSchema,
    system: PERSONA_CLASSIFICATION_SYSTEM_PROMPT,
    prompt: `Person: ${input.name}\nTitel: ${input.title}\nKontekst fra samtalen:\n${input.context}`,
  });

  return object;
};

export type { ValueArea, PersonaType };

 succeeded in 0ms:
import "server-only";

import { safeLog } from "@/features/common/services/safe-logger";
import { UpsertCustomerEntityFromExtraction } from "./customer-entity-service";
import { CustomerContact } from "./models";
import { classifyPersona, extractCustomerInsights } from "./structured-output";

/**
 * F-03 (Kunde-Intelligens) + F-04 (Persona-Kortlægning) — onFinish
 * extraction orchestration.
 *
 * Called from `chat-handler.ts`'s `onFinish` as `void runCustomerExtraction(...)`
 * — fire-and-forget, NEVER awaited by the request/response path. Every
 * failure is caught internally and reported via `safeLog` only (error
 * code + tenant/thread ids — never prompt or response text, per CLAUDE.md
 * "NEVER log prompt text"). A Cosmos hiccup or a bad `generateObject` call
 * here must never surface to the seller or delay the chat response, which
 * has already finished streaming by the time this runs.
 *
 * Design: a single `extractCustomerInsights` call detects the customer name,
 * new contacts (name + title only), challenges and mentioned value areas
 * from the just-completed exchange. Only when a contact was extracted WITH
 * both a name and a title does this proceed to a second, per-contact
 * `classifyPersona` call (F-04's "PersonaClassification runs ... when a
 * person+title appears") — bounded to the first 3 contacts per turn to cap
 * latency/cost on multi-attendee messages. The customer entity is only
 * created/updated when `customerNameConfidence` is "high" — "medium"/"low"
 * matches are deliberately dropped rather than risk building an incorrect
 * customer profile from a guess.
 */

const MAX_CONTACTS_TO_CLASSIFY_PER_TURN = 3;

export const runCustomerExtraction = async (input: {
  tenantSlug: string;
  ownerHashedId: string;
  userMessage: string;
  assistantMessage: string;
}): Promise<void> => {
  try {
    const insights = await extractCustomerInsights({
      userMessage: input.userMessage,
      assistantMessage: input.assistantMessage,
    });

    if (!insights.customerName || insights.customerNameConfidence !== "high") {
      return;
    }

    const namedContacts = insights.newContacts.filter(
      (c): c is { name: string; title: string } => Boolean(c.name && c.title)
    );

    const classifiedContacts: CustomerContact[] = [];
    for (const contact of namedContacts.slice(0, MAX_CONTACTS_TO_CLASSIFY_PER_TURN)) {
      try {
        const persona = await classifyPersona({
          name: contact.name,
          title: contact.title,
          context: `${input.userMessage}\n${input.assistantMessage}`,
        });

        classifiedContacts.push({
          name: persona.name,
          title: persona.title,
          personaType: persona.personaType,
          primaryValueArea: persona.primaryValueArea,
          secondaryValueArea: persona.secondaryValueArea,
          knownTriggers: persona.knownTriggers,
          communicationTips: persona.communicationTips,
          suggestedQuestions: persona.suggestedQuestions,
          notes: "",
        });
      } catch (error) {
        safeLog.error("sales-coach.extraction.persona-classify-failed", {
          tenantSlug: input.tenantSlug,
        });
        // Fall back to an unclassified contact record rather than dropping it entirely.
        classifiedContacts.push({
          name: contact.name,
          title: contact.title,
          personaType: null,
          primaryValueArea: null,
          secondaryValueArea: null,
          knownTriggers: [],
          communicationTips: [],
          suggestedQuestions: [],
          notes: "",
        });
      }
    }

    const result = await UpsertCustomerEntityFromExtraction({
      tenantSlug: input.tenantSlug,
      ownerHashedId: input.ownerHashedId,
      customerName: insights.customerName,
      newChallenges: [...insights.newChallenges, ...insights.newTriggers],
      newValueAreas: insights.mentionedValueAreas,
      newContacts: classifiedContacts,
    });

    if (result.status !== "OK") {
      safeLog.error("sales-coach.extraction.upsert-failed", { tenantSlug: input.tenantSlug });
    }
  } catch (error) {
    safeLog.error("sales-coach.extraction.failed", { tenantSlug: input.tenantSlug });
  }
};

 succeeded in 0ms:
import "server-only";

import { getChatModel } from "@/features/common/services/azure-ai";
import { safeLog } from "@/features/common/services/safe-logger";
import { generateObject } from "ai";
import { z } from "zod";

/**
 * STT post-processing — backlog F-02 "AI-rensning og kategorisering".
 *
 * One `generateObject` call (default/mini deployment — same
 * `AZURE_OPENAI_CHAT_DEPLOYMENT` contract as structured-output.ts) that
 * cleans filler words/false starts out of a raw speech-to-text transcript
 * and classifies the seller's intent, so the chat UI can react (e.g. a
 * "meeting-update" auto-starts the F-02 coaching flow via
 * `intent-detection.ts`'s existing keyword path once the cleaned text is
 * sent as a normal message — this module does not itself trigger that flow,
 * it only prepares the text that lands in the editable input field).
 *
 * MUST NEVER block the user: any failure (rate limit, transient error)
 * falls back to the raw transcript unchanged, category "free-chat" — the
 * caller (route handler) always returns 200 with usable text, never
 * surfaces a cleanup failure as a user-facing error.
 */

export const SttIntentCategorySchema = z.enum([
  "meeting-update",
  "customer-observation",
  "question",
  "free-chat",
]);
export type SttIntentCategory = z.infer<typeof SttIntentCategorySchema>;

const SttCleanupResultSchema = z.object({
  category: SttIntentCategorySchema,
  cleanedText: z.string(),
});
export type SttCleanupResult = z.infer<typeof SttCleanupResultSchema>;

const STT_CLEANUP_SYSTEM_PROMPT = `Du renser en rå tale-til-tekst-transskription fra en sælger, uden at ændre meningen.

Regler for "cleanedText":
- Fjern fyldeord (øhh, altså, ikk, hmm) og gentagelser/false starts.
- Ret oplagte tale-til-tekst-fejl og sætningsstruktur, men opfind intet nyt indhold.
- Bevar sprog (dansk/engelsk/norsk/svensk/tysk) og sælgerens egen ordlyd så vidt muligt — dette er en oprydning, ikke en omskrivning.
- Er transskriptionen allerede ren, returér den stort set uændret.

Regler for "category":
- "meeting-update": sælgeren beskriver hvad der skete i et møde/en samtale.
- "customer-observation": sælgeren deler en observation eller et faktum om en kunde/kontakt, uden at beskrive et konkret møde.
- "question": sælgeren stiller et direkte spørgsmål der forventer et svar.
- "free-chat": alt andet.`;

export const cleanupSttTranscript = async (rawText: string): Promise<SttCleanupResult> => {
  const trimmed = rawText.trim();
  if (trimmed.length === 0) {
    return { category: "free-chat", cleanedText: rawText };
  }

  try {
    const { object } = await generateObject({
      model: getChatModel(),
      schema: SttCleanupResultSchema,
      system: STT_CLEANUP_SYSTEM_PROMPT,
      prompt: trimmed,
    });
    return object;
  } catch {
    safeLog.warn("sales-coach.stt-cleanup-failed");
    return { category: "free-chat", cleanedText: rawText };
  }
};

 succeeded in 0ms:
import "server-only";

import {
  ServerActionResponse,
  zodErrorsToServerActionErrors,
} from "@/features/common/server-action-response";
import { ConfigContainer } from "@/features/common/services/cosmos";
import { safeLog } from "@/features/common/services/safe-logger";
import { SqlQuerySpec } from "@azure/cosmos";
import {
  ALL_MODULE_KEYS,
  CustomerEntity,
  MODULE_CONFIG_ATTRIBUTE,
  ModuleConfig,
  ModuleConfigEntry,
  ModuleConfigSchema,
  ModuleKey,
  SALES_COACH_MODULE_REGISTRY,
  SalesCoachModuleDefinition,
  VALUE_AREA_LABELS,
} from "./models";

// Re-exported for backward compatibility — every existing import in this
// codebase pulls these from context-injection.ts. models.ts (no
// "server-only" pragma) is now the source of truth so client components
// (e.g. the Help panel's "The 7 models" tab) can import the registry
// without pulling in Cosmos/server-only code — see models.ts doc comment.
export { ALL_MODULE_KEYS, SALES_COACH_MODULE_REGISTRY };
export type { SalesCoachModuleDefinition };

/**
 * Sales Coach Context Injection — SHARED 2 (backlog "Tekniske
 * Fælles-komponenter"). Used by F-01, F-02, F-04 (and F-07 in a later
 * phase). Everything in this file is either a pure string-building function
 * or the per-tenant `ModuleConfig` Cosmos accessor — no chat/tool-calling
 * logic lives here (see `intent-detection.ts` / `meeting-prep-tool.ts`).
 */

// ---------------------------------------------------------------------------
// 1. The 7 Sales Coach modules registry — moved to models.ts (client-safe,
//    no "server-only" pragma) and re-exported above for backward
//    compatibility with every existing import in this codebase.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 2. Per-tenant ModuleConfig — Cosmos ConfigContainer, partitioned on
//    tenantSlug (see models.ts module doc). Seeded all-active on first read,
//    mirroring `EnsureTenantTheme`'s seed-on-first-boot pattern.
// ---------------------------------------------------------------------------

const moduleConfigDocId = (tenantSlug: string) => `sales-coach-modules-${tenantSlug}`;

const buildDefaultModuleConfig = (tenantSlug: string): ModuleConfig => {
  const now = new Date().toISOString();
  return {
    id: moduleConfigDocId(tenantSlug),
    type: MODULE_CONFIG_ATTRIBUTE,
    userId: tenantSlug,
    tenantSlug,
    modules: ALL_MODULE_KEYS.map((key, index) => ({
      key,
      active: true,
      order: index + 1,
      customName: null,
      language: "da",
      contentOverride: null,
    })),
    createdAt: now,
    updatedAt: now,
  };
};

export const GetModuleConfig = async (
  tenantSlug: string
): Promise<ServerActionResponse<ModuleConfig>> => {
  try {
    const querySpec: SqlQuerySpec = {
      query: "SELECT * FROM root r WHERE r.type=@type AND r.tenantSlug=@tenantSlug",
      parameters: [
        { name: "@type", value: MODULE_CONFIG_ATTRIBUTE },
        { name: "@tenantSlug", value: tenantSlug },
      ],
    };
    const { resources } = await ConfigContainer()
      .items.query<ModuleConfig>(querySpec, { partitionKey: tenantSlug })
      .fetchAll();

    if (resources.length === 0) {
      return { status: "NOT_FOUND", errors: [{ message: "Module config not found." }] };
    }

    const parsed = ModuleConfigSchema.safeParse(resources[0]);
    if (!parsed.success) {
      return { status: "ERROR", errors: zodErrorsToServerActionErrors(parsed.error.errors) };
    }
    return { status: "OK", response: parsed.data };
  } catch (error) {
    safeLog.error("sales-coach.module-config.get-failed", { tenantSlug });
    return { status: "ERROR", errors: [{ message: "Unable to load module configuration." }] };
  }
};

/** Seed-on-first-boot — see `EnsureTenantTheme` for the same pattern. */
export const EnsureModuleConfig = async (
  tenantSlug: string
): Promise<ServerActionResponse<ModuleConfig>> => {
  const existing = await GetModuleConfig(tenantSlug);
  if (existing.status === "OK") return existing;
  if (existing.status !== "NOT_FOUND") return existing;

  const seeded = buildDefaultModuleConfig(tenantSlug);
  try {
    const { resource } = await ConfigContainer().items.create<ModuleConfig>(seeded);
    if (resource) return { status: "OK", response: resource };
    safeLog.error("sales-coach.module-config.seed-failed", { tenantSlug });
    return { status: "ERROR", errors: [{ message: "Unable to initialize module configuration." }] };
  } catch (error) {
    const code = (error as { code?: number })?.code;
    if (code === 409) {
      return await GetModuleConfig(tenantSlug);
    }
    safeLog.error("sales-coach.module-config.seed-failed", { tenantSlug, statusCode: code });
    return { status: "ERROR", errors: [{ message: "Unable to initialize module configuration." }] };
  }
};

export type ActiveModuleView = SalesCoachModuleDefinition & Pick<ModuleConfigEntry, "order" | "customName">;

/** Active modules for a tenant, merged with their registry name/essence, ordered per `ModuleConfigEntry.order`. */
export const GetActiveModules = async (tenantSlug: string): Promise<ActiveModuleView[]> => {
  const config = await EnsureModuleConfig(tenantSlug);
  if (config.status !== "OK") return [];

  return config.response.modules
    .filter((m) => m.active)
    .sort((a, b) => a.order - b.order)
    .map((m) => ({ ...SALES_COACH_MODULE_REGISTRY[m.key], order: m.order, customName: m.customName }));
};

// ---------------------------------------------------------------------------
// 3. System prompt builder — SAD §30.4 structure. Pure function, no I/O.
// ---------------------------------------------------------------------------

export type CoachingContext = "meeting-prep" | "conversation-coaching" | null;

/** Minimal, non-PII summary of a matched customer entity for proactive context injection (F-03). */
export type CustomerContextSummary = {
  customerName: string;
  knownChallenges: string[];
  valueAreas: CustomerEntity["valueAreas"];
  contacts: Pick<CustomerEntity["contacts"][number], "name" | "title" | "personaType" | "primaryValueArea">[];
};

export type SalesCoachPersonaContext = {
  assistantName: string;
  coachingContext: CoachingContext;
  customerContext?: CustomerContextSummary | null;
};

const buildModuleSection = (activeModules: ActiveModuleView[]): string => {
  if (activeModules.length === 0) return "";
  const lines = activeModules
    .map((m) => `- ${m.customName ?? m.name}: ${m.essence}`)
    .join("\n");
  return `## Aktiverede Sales Coach modeller\nDu er vejledt i følgende modeller og bruger dem aktivt i dine svar:\n${lines}`;
};

const buildCustomerContextSection = (context: CustomerContextSummary): string => {
  const challenges = context.knownChallenges.length > 0 ? context.knownChallenges.join(", ") : "Ingen registreret endnu";
  const valueAreas =
    context.valueAreas.length > 0
      ? context.valueAreas.map((v) => VALUE_AREA_LABELS[v]).join(", ")
      : "Ingen registreret endnu";
  const contacts =
    context.contacts.length > 0
      ? context.contacts.map((c) => `${c.name} (${c.title})`).join(", ")
      : "Ingen registreret endnu";

  return `## Kendt kunde-kontekst — ${context.customerName}\nBrug denne viden proaktivt, spørg ikke om information du allerede har:\n- Kendte udfordringer: ${challenges}\n- Relevante value areas: ${valueAreas}\n- Kendte kontakter: ${contacts}`;
};

const MEETING_PREP_GUIDANCE = `## Mødeforberedelses-flow (360° Customer Understanding Model)
Sælgeren har bedt om hjælp til at forberede et kundemøde. Følg denne struktur:
1. Stil mindst disse 4 guidende spørgsmål — ét ad gangen, i naturlig samtale, ikke som en formular:
   - Hvad ved du om kundens vision og strategi?
   - Hvem deltager i mødet? Hvad er deres rolle?
   - Hvad er deres primære udfordringer lige nu?
   - Hvilke value areas er mest relevante?
2. Når du har fået brugbare svar på alle 4 (kunde-kontekst ovenfor tæller som allerede besvaret — spørg ikke igen om det du allerede ved), kald funktionen \`meetingPrep\` med en samlet syntese af det du har lært. Kald den ALDRIG før du har stillet spørgsmålene.
3. Når \`meetingPrep\` returnerer et resultat med et \`embedDirective\` felt, svarer du med ÉT kort intro-sætning efterfulgt af \`embedDirective\`-værdien indsat ordret som resten af dit svar. Gengiv IKKE brief-indholdet i almindelig tekst — embed-direktivet er hele visningen.`;

const CONVERSATION_COACHING_GUIDANCE = `## Samtalecoaching (1st/2nd Position Model)
Sælgeren beskriver hvad der skete i et møde eller en samtale. Giv konkret, handlingsrettet feedback:
1. Identificér om sælgerens sprog var 1st Position (fokus på eget produkt/agenda) eller 2nd Position (fokus på kundens verden).
2. Vær specifik — citér eller referér til det sælgeren faktisk skrev.
3. Foreslå mindst én konkret alternativ formulering sælgeren kan bruge næste gang.
4. Kobl feedbacken eksplicit til et navngivet Sales Coach-model (f.eks. "Dette er 1st/2nd Position Model" eller "Dette relaterer til Value Conversation Model").`;

/**
 * Builds the Sales Coach system-prompt block: active-module guidance
 * (SAD §30.4) + optional guided-flow instructions for the active coaching
 * context + optional proactive customer-context injection (F-03).
 *
 * Signature intentionally matches the backlog's
 * `buildSalesCoachSystemPrompt(activeModules, persona)` shape — `persona`
 * here bundles the assistant name, active coaching context and matched
 * customer summary needed across F-01/F-02/F-04.
 */
export const buildSalesCoachSystemPrompt = (
  activeModules: ActiveModuleView[],
  persona: SalesCoachPersonaContext
): string => {
  const sections: string[] = [buildModuleSection(activeModules)];

  if (persona.customerContext) {
    sections.push(buildCustomerContextSection(persona.customerContext));
  }

  if (persona.coachingContext === "meeting-prep") {
    sections.push(MEETING_PREP_GUIDANCE);
  } else if (persona.coachingContext === "conversation-coaching") {
    sections.push(CONVERSATION_COACHING_GUIDANCE);
  }

  return sections.filter((s) => s.length > 0).join("\n\n");
};

exec
/bin/zsh -lc "sed -n '1,260p' src/features/sales-coach/meeting-prep-tool.ts" in /Users/hugosson/workspace/SalesPrism
 succeeded in 0ms:
import "server-only";

import { safeLog } from "@/features/common/services/safe-logger";
import { tool } from "ai";
import { z } from "zod";
import { FindCustomerEntityByName } from "./customer-entity-service";
import { CreateMeetingBrief } from "./meeting-brief-service";
import { generateMeetingBrief } from "./structured-output";
import { CustomerEntity, VALUE_AREA_LABELS } from "./models";

/**
 * F-01 — the model-initiated half of the meeting-prep flow (the keyword
 * heuristic half lives in `intent-detection.ts`). The model calls this tool
 * once it has walked the seller through the 4 guiding 360° questions (see
 * the `MEETING_PREP_GUIDANCE` system-prompt block in `context-injection.ts`)
 * — never before.
 *
 * Rendering contract, mirroring `rag-tool.ts`'s citation-directive pattern:
 * the tool does NOT return brief content for the model to restate in prose.
 * It returns a small `embedDirective` string
 * (`{% meeting-brief id="..." /%}`) that the model is instructed (system
 * prompt) to emit verbatim as its answer. `markdown/config.tsx` registers a
 * matching Markdoc tag that renders the saved brief as the DESIGN.md §5.3 AI
 * Response Block via `<MeetingBriefEmbed>`.
 */
export const createMeetingPrepTool = (props: {
  tenantSlug: string;
  ownerHashedId: string;
  chatThreadId: string;
}) => {
  const { tenantSlug, ownerHashedId, chatThreadId } = props;

  return tool({
    description:
      "Generates and saves a structured meeting-preparation brief for the named customer. " +
      "Call this ONLY after asking the seller the 4 guiding 360° Customer Understanding questions " +
      "(vision/strategy, meeting attendees & roles, current challenges, relevant value areas) and receiving usable answers — " +
      "known customer context already provided in the system prompt counts as already answered. " +
      "After this tool returns successfully, respond with one short sentence plus the returned `embedDirective` value inserted verbatim as the rest of your answer — do not restate the brief content in prose.",
    inputSchema: z.object({
      customerName: z.string().describe("The customer/account name the meeting is with"),
      meetingTopic: z.string().describe("What the meeting is about"),
      conversationContext: z
        .string()
        .describe(
          "A synthesis of everything the seller shared across the 4 guiding questions: vision/strategy, attendees & roles, challenges, relevant value areas"
        ),
    }),
    execute: async ({ customerName, meetingTopic, conversationContext }) => {
      try {
        const existingEntity = await FindCustomerEntityByName(tenantSlug, ownerHashedId, customerName);
        const existingCustomerSummary =
          existingEntity.status === "OK" ? summarizeExistingCustomer(existingEntity.response) : undefined;

        const brief = await generateMeetingBrief({
          customerName,
          meetingTopic,
          conversationContext,
          existingCustomerSummary,
        });

        const saved = await CreateMeetingBrief({
          tenantSlug,
          ownerHashedId,
          chatThreadId,
          customerEntityId: existingEntity.status === "OK" ? existingEntity.response.id : null,
          brief,
        });

        if (saved.status !== "OK") {
          safeLog.error("sales-coach.meeting-prep.save-failed", { tenantSlug });
          return { error: "Unable to save the meeting brief right now. Please try again." };
        }

        return {
          briefId: saved.response.id,
          customerName,
          embedDirective: `{% meeting-brief id="${saved.response.id}" /%}`,
        };
      } catch (error) {
        safeLog.error("sales-coach.meeting-prep.generate-failed", { tenantSlug });
        return { error: "Unable to generate the meeting brief right now. Please try again." };
      }
    },
  });
};

const summarizeExistingCustomer = (entity: CustomerEntity): string => {
  const challenges = entity.knownChallenges.length > 0 ? entity.knownChallenges.join(", ") : "none recorded";
  const valueAreas =
    entity.valueAreas.length > 0 ? entity.valueAreas.map((v) => VALUE_AREA_LABELS[v]).join(", ") : "none recorded";
  const contacts =
    entity.contacts.length > 0
      ? entity.contacts.map((c) => `${c.name} (${c.title})`).join(", ")
      : "none recorded";
  return `Known challenges: ${challenges}. Relevant value areas: ${valueAreas}. Known contacts: ${contacts}.`;
};

exec
/bin/zsh -lc "sed -n '1,240p' src/features/chat-page/chat-services/model-router.ts" in /Users/hugosson/workspace/SalesPrism
 succeeded in 0ms:
import "server-only";

import { getChatModel } from "@/features/common/services/azure-ai";
import type { PlatformTier } from "@/features/theme/tenant-theme";
import { safeLog } from "@/features/common/services/safe-logger";
import { generateObject } from "ai";
import { z } from "zod";

/**
 * Two-step model routing — SAD v2.7 §18 Phase F, superseded model reality
 * per ADR-001 (docs/architecture-decisions/ADR-001-model-baseline.md).
 *
 * The SAD's original wording (Phi-4 mini -> GPT-4.1 mini -> GPT-4o) is
 * obsolete: the entire GPT-4.x family is deprecated for this subscription,
 * and only `gpt-5.4-mini` currently has DataZoneStandard quota (ADR-001
 * "Subscription-verified availability" table). `gpt-5.4` (Professional) and
 * `gpt-5.5` (Enterprise) are quota-gated as of 2026-07-30.
 *
 * Deliberate design consequence: the deployment map below is ENV-DRIVEN,
 * not hardcoded to model names. `AZURE_OPENAI_CHAT_DEPLOYMENT` (already
 * required by azure-ai.ts) is the always-available default. The optional
 * `_LOW` / `_HIGH` overrides let a customer's Bicep-provisioned Azure
 * OpenAI resource add cheaper/more-capable deployments later (e.g.
 * `gpt-5-nano` once its quota lands, per ADR-001 point 3) WITHOUT a code
 * change — until then, both are unset and every request routes to the
 * default deployment regardless of classified complexity. This function
 * must never return a deployment name that isn't guaranteed to exist.
 */
export const AZURE_OPENAI_CHAT_DEPLOYMENT_LOW: string | undefined =
  process.env.AZURE_OPENAI_CHAT_DEPLOYMENT_LOW || undefined;

export const AZURE_OPENAI_CHAT_DEPLOYMENT_HIGH: string | undefined =
  process.env.AZURE_OPENAI_CHAT_DEPLOYMENT_HIGH || undefined;

export type QueryComplexity = "low" | "medium" | "high";

export type ChatDeploymentMap = {
  /** `AZURE_OPENAI_CHAT_DEPLOYMENT` — always set (azure-ai.ts enforces a fallback literal). */
  default: string;
  /** `AZURE_OPENAI_CHAT_DEPLOYMENT_LOW`, optional — cheaper/faster deployment for trivial queries. */
  low?: string;
  /** `AZURE_OPENAI_CHAT_DEPLOYMENT_HIGH`, optional — more capable deployment for high-complexity queries. */
  high?: string;
};

/** Reads the current deployment map from the environment. Pure aside from `process.env` reads. */
export const resolveChatDeploymentMap = (): ChatDeploymentMap => ({
  default: process.env.AZURE_OPENAI_CHAT_DEPLOYMENT || "gpt-5.4-mini",
  low: AZURE_OPENAI_CHAT_DEPLOYMENT_LOW,
  high: AZURE_OPENAI_CHAT_DEPLOYMENT_HIGH,
});

// ---------------------------------------------------------------------------
// Step 1a — cheap heuristic short-circuit (no model call). Pure, synchronous,
// unit-testable in isolation (see tenant-resolver.ts for the same pattern
// used elsewhere in this codebase). Only handles the OBVIOUS ends of the
// spectrum; anything else returns `null` so the caller falls through to the
// model-based classifier (step 1b) instead of guessing.
// ---------------------------------------------------------------------------

/** Trivial greetings/acknowledgements — never worth a classifier round-trip. */
const TRIVIAL_MESSAGE_PATTERN =
  /^(hi|hey|hello|hej|hejsa|tak|thanks|thank you|ok|okay|ja|nej|yes|no|goddag|davs)[!.? ]*$/i;

/**
 * Danish-first (SAD §28) with English fallbacks, matching intent-detection.ts's
 * bilingual convention. Signals multi-stakeholder / strategic / high-stakes
 * reasoning that benefits from the most capable available deployment —
 * mirrors the SAD's "multi-document, kompleks ræsonnering, høj-stakes"
 * description of the top routing tier.
 */
const HIGH_COMPLEXITY_KEYWORDS: RegExp[] = [
  /strateg(i|isk|y)/i,
  /forhandl(e|ing)/i,
  /negotiat/i,
  /konkurrent/i,
  /competitor/i,
  /bestyrelse/i,
  /\bboard\b/i,
  /flerårig/i,
  /multi[- ]year/i,
  /cross[- ]functional/i,
  /tvær(gående|organisatorisk)/i,
  /sammenlign.*(tilbud|leverandør|kontrakt)/i,
  /compare.*(vendors?|contracts?|proposals?)/i,
  /kompleks(e)?\s+(sag|situation|kunde)/i,
];

/** Long/detailed messages are more likely to need multi-hop reasoning over a short one-liner. */
const HIGH_COMPLEXITY_LENGTH_THRESHOLD = 600;

/** Short, single-sentence questions with no complexity signal are cheap FAQ/lookup territory. */
const LOW_COMPLEXITY_LENGTH_THRESHOLD = 40;

export const classifyByHeuristic = (message: string): QueryComplexity | null => {
  const trimmed = message.trim();

  if (trimmed.length === 0) return "low";
  if (TRIVIAL_MESSAGE_PATTERN.test(trimmed)) return "low";

  if (HIGH_COMPLEXITY_KEYWORDS.some((pattern) => pattern.test(trimmed))) return "high";
  if (trimmed.length > HIGH_COMPLEXITY_LENGTH_THRESHOLD) return "high";

  if (trimmed.length <= LOW_COMPLEXITY_LENGTH_THRESHOLD && (trimmed.match(/\?/g)?.length ?? 0) <= 1) {
    return "low";
  }

  // Ambiguous — defer to the model classifier (step 1b).
  return null;
};

// ---------------------------------------------------------------------------
// Step 1b — model-based classifier. Runs ONLY when the heuristic above
// returns null. Always executes on the default (mini/nano-tier) deployment
// per ADR-001 point 3 ("Routing classifier ... gpt-5.4-mini now; migrate to
// gpt-5-nano when quota is granted") — never on `_LOW`/`_HIGH`, since the
// classifier itself must stay on the cheapest available deployment
// regardless of what it ultimately routes the real request to.
// ---------------------------------------------------------------------------

const ComplexityClassificationSchema = z.object({
  complexity: z.enum(["low", "medium", "high"]),
  reason: z.string(),
});

const CLASSIFIER_SYSTEM_PROMPT = `You classify a single sales-coaching chat message by how much reasoning it needs, so the platform can route it to the right-sized AI model. Reply with exactly one of:
- "low": a simple factual/FAQ-style lookup or a narrow, well-structured RAG question with one clear answer.
- "medium": a standard coaching conversation, document analysis, or a normal multi-sentence request — the common case.
- "high": multi-document or multi-stakeholder reasoning, high-stakes negotiation/strategy framing, or a request that requires connecting several distinct pieces of context.
Prefer "medium" when unsure — only choose "low" or "high" when the signal is clear.`;

/**
 * Model-based classification fallback. Never throws: a classifier failure
 * (rate limit, transient Azure OpenAI error, etc.) must never block the
 * chat request it's meant to route — falls back to "medium" (the safe,
 * always-available default deployment) and logs the failure via safeLog.
 */
export const classifyComplexityWithModel = async (
  message: string,
  requestId: string
): Promise<QueryComplexity> => {
  try {
    const { object } = await generateObject({
      model: getChatModel(resolveChatDeploymentMap().default),
      schema: ComplexityClassificationSchema,
      system: CLASSIFIER_SYSTEM_PROMPT,
      prompt: message,
    });
    return object.complexity;
  } catch {
    safeLog.warn("chat.model-router.classifier-failed", { requestId });
    return "medium";
  }
};

// ---------------------------------------------------------------------------
// Step 2 — deployment selection. Pure function, no I/O — the tier gate and
// the "never route to an unset deployment" fallback both live here so they
// can be unit-tested without mocking `generateObject`/Cosmos.
// ---------------------------------------------------------------------------

export type ModelSelection = {
  deploymentName: string;
  complexity: QueryComplexity;
};

/**
 * `tier === "smb"` is this platform's "Standard" pricing tier (see
 * CLAUDE.md's model-tier tag values `standard | professional | enterprise`;
 * `TenantTheme.tier` uses the Cosmos-literal `"smb"` for the same tier —
 * `RecordPromptEvent`'s `process.env.PLATFORM_TIER || "smb"` fallback in
 * chat-handler.ts already treats the two as equivalent). Standard-tier
 * tenants must never escalate above the default deployment, even if a
 * `_HIGH` override happens to be configured — only Professional/Enterprise
 * tenants (or an unresolvable/unknown tier — fail OPEN to normal routing,
 * consistent with this codebase's other tenant-lookup fail-open behavior,
 * e.g. `getRequestTenantTheme` in app/layout.tsx) can escalate.
 *
 * Downgrading to `_LOW` for a trivial query is always allowed at every
 * tier — that's a cost optimization, not a capability the tenant is paying
 * for, so there's nothing to gate.
 */
export const selectDeployment = (
  complexity: QueryComplexity,
  tier: PlatformTier | null | undefined,
  deployments: ChatDeploymentMap
): ModelSelection => {
  if (complexity === "low") {
    return { deploymentName: deployments.low ?? deployments.default, complexity };
  }

  if (complexity === "high" && tier !== "smb") {
    return { deploymentName: deployments.high ?? deployments.default, complexity };
  }

  return { deploymentName: deployments.default, complexity };
};

// ---------------------------------------------------------------------------
// Orchestrator — wires steps 1a/1b/2 together and resolves the actual
// `LanguageModel` instance. This is the only export chat-handler.ts needs.
// ---------------------------------------------------------------------------

export type RouteChatModelInput = {
  message: string;
  tier: PlatformTier | null | undefined;
  requestId: string;
  /**
   * Whether the RAG tool is available for this turn (documents attached to
   * the thread). Documents present means this is never a zero-context
   * trivial lookup — floors a heuristic/classifier "low" result to
   * "medium" so document analysis doesn't get routed to the cheapest tier.
   */
  hasDocuments: boolean;
};

export type RouteChatModelResult = ModelSelection & {
  model: ReturnType<typeof getChatModel>;
};

export const routeChatModel = async (
  input: RouteChatModelInput
): Promise<RouteChatModelResult> => {
  const deployments = resolveChatDeploymentMap();

  let complexity = classifyByHeuristic(input.message);
  if (complexity === null) {
    complexity = await classifyComplexityWithModel(input.message, input.requestId);
  }

  if (input.hasDocuments && complexity === "low") {
    complexity = "medium";
  }

  const selection = selectDeployment(complexity, input.tier, deployments);

  return { ...selection, model: getChatModel(selection.deploymentName) };
};

exec
/bin/zsh -lc "sed -n '1,260p' src/features/theme/tenant-resolver.ts" in /Users/hugosson/workspace/SalesPrism
exec
/bin/zsh -lc "sed -n '1,360p' src/features/chat-page/chat-services/chat-handler.ts" in /Users/hugosson/workspace/SalesPrism
 succeeded in 0ms:
/**
 * Tenant resolution — derives the customer slug from the inbound `Host`
 * header. Pure, synchronous, unit-testable: no Cosmos/Azure calls here.
 *
 * SAD v2.7 §5.3 / Stage 4 brief: production tenants are addressed as
 * `{slug}-sales360.pixelflow.dk`. Anything that doesn't match that pattern
 * (localhost, `*.azurewebsites.net` staging slots, or an unrecognized
 * host) resolves to the `TENANT_SLUG` env var (default `val1`) — this
 * covers local dev and the App Service default hostname before a
 * customer's Cloudflare DNS record is cut over.
 *
 * NOTE: this pattern differs from the `{slug}.sales-prism.com` production
 * domain described in SAD §12.1. Confirm with Kristjan whether
 * `pixelflow.dk` is an interim/staging domain or supersedes the SAD
 * pattern before this ships to a customer-facing environment.
 */

const TENANT_SUBDOMAIN_PATTERN = /^([a-z][a-z0-9-]{1,19})-sales360\.pixelflow\.dk$/;

const DEFAULT_TENANT_SLUG = "val1";

/**
 * Strips port and casing from a raw `Host` header value.
 * `dsv-sales360.pixelflow.dk:3000` -> `dsv-sales360.pixelflow.dk`
 */
export const normalizeHost = (hostHeader: string | null | undefined): string => {
  if (!hostHeader) return "";
  return hostHeader.split(":")[0].trim().toLowerCase();
};

/**
 * Returns the platform-default tenant slug for non-production hosts
 * (local dev, `*.azurewebsites.net` staging slots).
 */
export const getDefaultTenantSlug = (): string => {
  const configured = process.env.TENANT_SLUG?.trim();
  return configured && configured.length > 0 ? configured : DEFAULT_TENANT_SLUG;
};

/**
 * Resolves the tenant slug for the current request from its `Host` header.
 *
 * - `dsv-sales360.pixelflow.dk` -> `"dsv"`
 * - `localhost:3000`, `app-azurechat-val1.azurewebsites.net`, or any
 *   other unrecognized host -> `getDefaultTenantSlug()`
 */
export const resolveTenantSlug = (hostHeader: string | null | undefined): string => {
  const hostname = normalizeHost(hostHeader);
  const match = hostname.match(TENANT_SUBDOMAIN_PATTERN);
  if (match) {
    return match[1];
  }
  return getDefaultTenantSlug();
};

export { TENANT_SUBDOMAIN_PATTERN };

/**
 * Request-scoped convenience wrapper around `resolveTenantSlug` for server
 * components / server actions / route handlers that don't already have a
 * `Headers` object in hand. Kept separate from the pure functions above
 * (which stay synchronous and Azure/Next-free for unit testing) — this one
 * reads Next's `headers()` dynamic API, so it can only run in a request
 * context.
 */
export const getCurrentTenantSlug = async (): Promise<string> => {
  const { headers } = await import("next/headers");
  const requestHeaders = await headers();
  return resolveTenantSlug(requestHeaders.get("host"));
};

 succeeded in 0ms:
"use server";
import "server-only";

import { RecordPromptEvent } from "@/features/admin/activity-service";
import { getCurrentUser, userHashedId } from "@/features/auth-page/helpers";
import { newRequestId, safeLog } from "@/features/common/services/safe-logger";
import {
  buildSalesCoachSystemPrompt,
  CustomerContextSummary,
  GetActiveModules,
} from "@/features/sales-coach/context-injection";
import { FindCustomerEntitiesForOwner } from "@/features/sales-coach/customer-entity-service";
import { runCustomerExtraction } from "@/features/sales-coach/extraction-service";
import { detectCoachingContext, findMentionedCustomerName } from "@/features/sales-coach/intent-detection";
import { createMeetingPrepTool } from "@/features/sales-coach/meeting-prep-tool";
import { getCurrentTenantSlug } from "@/features/theme/tenant-resolver";
import { GetTenantTheme, PlatformTier } from "@/features/theme/tenant-theme";
import { CHAT_DEFAULT_SYSTEM_PROMPT, AI_NAME } from "@/features/theme/theme-config";
import { stepCountIs, streamText, type ModelMessage } from "ai";
import { buildSystemPrompt, mapChatMessagesToModelMessages } from "./chat-message-mapper";
import { FindAllChatDocuments } from "./chat-document-service";
import {
  CreateChatMessage,
  FindTopChatMessagesForCurrentUser,
} from "./chat-message-service";
import { routeChatModel } from "./model-router";
import { createSearchDocumentsTool } from "./rag-tool";
import { EnsureChatThreadOperation, UpsertChatThread } from "./chat-thread-service";
import { ChatThreadModel, UserPrompt } from "./models";

/**
 * Maximum tool-call round-trips per turn: 1 for the initial searchDocuments
 * call + follow-ups if the model wants to refine its query, + 1 final step
 * to produce the grounded answer. streamText defaults to stepCountIs(1),
 * which would stop right after a tool call and never generate the answer —
 * this override is required for the RAG tool to actually work.
 */
const MAX_TOOL_STEPS = 4;

/**
 * Server-side chat orchestrator (Vercel AI SDK v6 `streamText`), replacing
 * the pre-migration `ChatAPIEntry` / `ChatCompletionStreamingRunner` pipeline.
 *
 * Preserved from the original: persona/system prompt assembly, Cosmos DB
 * chat history (server-authoritative — the client never supplies history),
 * per-thread document RAG with identical authorization filtering, thread
 * title auto-update, and multimodal (image) chat.
 *
 * Deferred (SAD §18 Phase C, Sprint 3 — documented, not ported): the
 * extensions/plugins subsystem (default DALL-E image-creation extension and
 * dynamic per-tenant API extensions). Tool-call/tool-result chat messages
 * are therefore no longer produced or persisted.
 */
export const ChatAPIEntry = async (
  props: UserPrompt,
  signal: AbortSignal
): Promise<Response> => {
  const requestId = newRequestId();
  const currentChatThreadResponse = await EnsureChatThreadOperation(props.id);

  if (currentChatThreadResponse.status !== "OK") {
    return new Response("", { status: 401 });
  }

  const currentChatThread = currentChatThreadResponse.response;

  const [user, userId, tenantSlug, history, docs] = await Promise.all([
    getCurrentUser(),
    userHashedId(),
    getCurrentTenantSlug(),
    _getHistory(currentChatThread, requestId),
    _getDocuments(currentChatThread, requestId),
  ]);

  const ragToolAvailable = docs.length > 0;

  // Model-router (SAD §18 Phase F / ADR-001) — tenant tier gates escalation
  // (see model-router.ts `selectDeployment` doc-comment). Fails OPEN to
  // `null` (unknown tier, full routing allowed) on a Cosmos hiccup, same
  // fail-open convention as `getRequestTenantTheme` in app/layout.tsx — a
  // TenantTheme lookup failure must never block the chat response.
  const tenantTierResponse = await GetTenantTheme(tenantSlug);
  const tenantTier: PlatformTier | null =
    tenantTierResponse.status === "OK" ? tenantTierResponse.response.tier : null;

  await CreateChatMessage({
    name: user.name,
    content: props.message,
    role: "user",
    chatThreadId: currentChatThread.id,
    multiModalImage: props.multimodalImage,
  });

  // Sales Coach 360 F-01/F-02 (Stage 5b) — per-message keyword classifier,
  // sticky across turns via `ChatThreadModel.coachingContext` (see its
  // doc-comment in ./models.ts) so the guided meeting-prep/coaching flow
  // survives follow-up messages that don't repeat the trigger phrase.
  const detectedContext = detectCoachingContext(props.message);
  const effectiveContext = detectedContext ?? currentChatThread.coachingContext ?? null;

  if (detectedContext && detectedContext !== currentChatThread.coachingContext) {
    await UpsertChatThread({ ...currentChatThread, coachingContext: detectedContext });
  }

  const [activeModules, customerEntitiesResponse] = await Promise.all([
    GetActiveModules(tenantSlug),
    FindCustomerEntitiesForOwner(tenantSlug, userId),
  ]);

  const knownCustomers =
    customerEntitiesResponse.status === "OK" ? customerEntitiesResponse.response : [];
  const mentionedCustomerName = findMentionedCustomerName(
    props.message,
    knownCustomers.map((c) => c.customerName)
  );
  const matchedCustomer = mentionedCustomerName
    ? knownCustomers.find((c) => c.customerName === mentionedCustomerName)
    : undefined;

  // F-03 — "kunde-kontekst injiceres proaktivt i mødeforberedelse": when the
  // seller mentions a customer we already have intel on, that intel is
  // injected into the system prompt instead of re-asking for it.
  const customerContext: CustomerContextSummary | null = matchedCustomer
    ? {
        customerName: matchedCustomer.customerName,
        knownChallenges: matchedCustomer.knownChallenges,
        valueAreas: matchedCustomer.valueAreas,
        contacts: matchedCustomer.contacts.map((c) => ({
          name: c.name,
          title: c.title,
          personaType: c.personaType,
          primaryValueArea: c.primaryValueArea,
        })),
      }
    : null;

  const salesCoachSystem = buildSalesCoachSystemPrompt(activeModules, {
    assistantName: AI_NAME,
    coachingContext: effectiveContext,
    customerContext,
  });

  const system = `${buildSystemPrompt(
    CHAT_DEFAULT_SYSTEM_PROMPT,
    currentChatThread.personaMessage,
    ragToolAvailable
  )}\n\n${salesCoachSystem}`;

  const messages: ModelMessage[] = [
    ...mapChatMessagesToModelMessages(history),
    _buildUserMessage(props),
  ];

  const meetingPrepAvailable = effectiveContext === "meeting-prep";
  const anyToolAvailable = ragToolAvailable || meetingPrepAvailable;

  const routedModel = await routeChatModel({
    message: props.message,
    tier: tenantTier,
    requestId,
    hasDocuments: ragToolAvailable,
  });

  const result = streamText({
    model: routedModel.model,
    system,
    messages,
    abortSignal: signal,
    tools: anyToolAvailable
      ? {
          ...(ragToolAvailable
            ? { searchDocuments: createSearchDocumentsTool({ userId, chatThreadId: currentChatThread.id }) }
            : {}),
          ...(meetingPrepAvailable
            ? {
                meetingPrep: createMeetingPrepTool({
                  tenantSlug,
                  ownerHashedId: userId,
                  chatThreadId: currentChatThread.id,
                }),
              }
            : {}),
        }
      : undefined,
    stopWhen: anyToolAvailable ? stepCountIs(MAX_TOOL_STEPS) : undefined,
    onFinish: async (event) => {
      // Thread title auto-update stays client-side (chat-store.tsx), invoked
      // directly against the `UpdateChatTitle` Server Action after the stream
      // completes — that is what makes Next.js auto-refresh the already
      // mounted chat-menu sidebar. Doing it here (inside a plain Route
      // Handler request, not a Server Action RPC) would persist the rename
      // but NOT refresh the client without an explicit `router.refresh()`.
      await CreateChatMessage({
        name: AI_NAME,
        content: event.text,
        role: "assistant",
        chatThreadId: currentChatThread.id,
      });

      // SAD §8.6 activity tracking — best-effort, never blocks the response.
      // Only counts/lengths/tokens are recorded, never prompt/response text.
      await RecordPromptEvent({
        tenantSlug,
        actorHashedId: userId,
        sessionId: currentChatThread.id,
        promptLength: props.message.length,
        tokensUsed: event.totalUsage.totalTokens,
        modelTier: process.env.PLATFORM_TIER || "smb",
      });

      // Model-router per-request log (SAD §18 Phase F) — codes/enums/counts
      // only, per safe-logger.ts's allow-list; tokensUsed is only known once
      // the stream finishes, hence logging here rather than at selection time.
      safeLog.info("chat.model-router.usage", {
        requestId,
        complexity: routedModel.complexity,
        deploymentUsed: routedModel.deploymentName,
        tokensUsed: event.totalUsage.totalTokens,
      });

      // F-03/F-04 — fire-and-forget customer/persona extraction. Never
      // awaited: `runCustomerExtraction` catches every failure internally
      // and reports only via `safeLog` (no prompt/response text), so it can
      // never delay or break the chat response above.
      void runCustomerExtraction({
        tenantSlug,
        ownerHashedId: userId,
        userMessage: props.message,
        assistantMessage: event.text,
      });
    },
  });

  return result.toUIMessageStreamResponse({
    onError: (error) => {
      // Codex review #1 finding 7 (MEDIUM) — never log the raw streamText
      // error object (routinely carries prompt text / retrieved content).
      // `requestId` is the only correlation surfaced to both the log line
      // and the user-facing message.
      safeLog.error("chat.stream-error", {
        requestId,
        chatThreadId: currentChatThread.id,
      });
      return `There was an error generating a response. Please try again. (ref: ${requestId})`;
    },
  });
};

const _buildUserMessage = (props: UserPrompt): ModelMessage => {
  if (props.multimodalImage && props.multimodalImage.length > 0) {
    return {
      role: "user",
      content: [
        { type: "text", text: props.message },
        { type: "image", image: props.multimodalImage },
      ],
    };
  }

  return { role: "user", content: props.message };
};

const _getHistory = async (chatThread: ChatThreadModel, requestId: string) => {
  const historyResponse = await FindTopChatMessagesForCurrentUser(chatThread.id);

  if (historyResponse.status === "OK") {
    return historyResponse.response.reverse();
  }

  safeLog.error("chat.history-lookup-failed", {
    requestId,
    chatThreadId: chatThread.id,
  });
  return [];
};

const _getDocuments = async (chatThread: ChatThreadModel, requestId: string) => {
  const docsResponse = await FindAllChatDocuments(chatThread.id);

  if (docsResponse.status === "OK") {
    return docsResponse.response;
  }

  safeLog.error("chat.document-lookup-failed", {
    requestId,
    chatThreadId: chatThread.id,
  });
  return [];
};

exec
/bin/zsh -lc "sed -n '1,280p' src/features/theme/tenant-theme.ts" in /Users/hugosson/workspace/SalesPrism
 succeeded in 0ms:
import "server-only";

import {
  ServerActionResponse,
  zodErrorsToServerActionErrors,
} from "@/features/common/server-action-response";
import { safeLog } from "@/features/common/services/safe-logger";
import { SqlQuerySpec } from "@azure/cosmos";
import { z } from "zod";
import { ConfigContainer } from "../common/services/cosmos";

/**
 * TenantTheme — Cosmos DB persistence + runtime shape for per-tenant
 * white-label theming and platform tiering.
 *
 * SAD v2.7 §10.3. Persisted in the existing `ConfigContainer` (see
 * src/features/common/services/cosmos.ts) alongside PromptModel /
 * PersonaModel / ExtensionModel documents, using the same `type`
 * discriminator + `/userId` partition-key convention.
 *
 * TenantTheme is a tenant-level singleton, not a per-user document — each
 * customer already gets a fully isolated, dedicated Cosmos DB instance
 * (SAD §6.1), so there is exactly one TenantTheme document per Cosmos
 * account. The `userId` partition-key field is set to the tenant slug
 * itself (`tenantSlug`) rather than an end-user id, purely so the
 * document fits the container's existing `/userId` partition key path.
 */
export const TENANT_THEME_ATTRIBUTE = "TENANT_THEME_CONFIG";

export const PlatformTierSchema = z.enum(["smb", "professional", "enterprise"]);
export type PlatformTier = z.infer<typeof PlatformTierSchema>;

export const AuthMethodSchema = z.enum(["entra-sso", "username-password"]);
export type AuthMethod = z.infer<typeof AuthMethodSchema>;

export const TenantThemeColorsSchema = z.object({
  primary: z.string(),
  background: z.string(),
  foreground: z.string(),
  fontDisplay: z.string(),
  fontBody: z.string(),
  logoUrl: z.string().optional(),
  faviconUrl: z.string().optional(),
});
export type TenantThemeColors = z.infer<typeof TenantThemeColorsSchema>;

export const TenantThemeDarkModeSchema = z.object({
  primary: z.string(),
  background: z.string(),
  foreground: z.string(),
});
export type TenantThemeDarkMode = z.infer<typeof TenantThemeDarkModeSchema>;

/**
 * Toggle-based platform features — SAD §8.6. `userAnalytics` gates the
 * `/admin/analytics` route. `.default(...)` so existing Cosmos documents
 * seeded before this field existed still parse successfully (Zod fills the
 * default rather than failing validation on a missing key).
 */
export const TenantFeaturesSchema = z
  .object({
    userAnalytics: z.boolean().default(false),
  })
  .default({ userAnalytics: false });
export type TenantFeatures = z.infer<typeof TenantFeaturesSchema>;

export type TenantTheme = z.infer<typeof TenantThemeModelSchema>;

export const TenantThemeModelSchema = z.object({
  id: z.string(),
  type: z.literal(TENANT_THEME_ATTRIBUTE),
  /** Cosmos partition key — set to `tenantSlug`, see module doc above. */
  userId: z.string(),
  tenantSlug: z.string(),
  tier: PlatformTierSchema,
  /** Enterprise-only. SMB/Professional tenants always render the standard
   *  Sales Prism tokens (DESIGN.md §2.7) unmodified — see §8.3. */
  whiteLabel: z.boolean(),
  authMethod: AuthMethodSchema,
  theme: TenantThemeColorsSchema.nullable(),
  darkMode: TenantThemeDarkModeSchema.nullable(),
  features: TenantFeaturesSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

const tenantThemeDocId = (tenantSlug: string) => `tenant-theme-${tenantSlug}`;

const buildDefaultTenantTheme = (tenantSlug: string): TenantTheme => {
  const now = new Date().toISOString();
  const tier = PlatformTierSchema.safeParse(process.env.PLATFORM_TIER);
  const resolvedTier = tier.success ? tier.data : "smb";

  return {
    id: tenantThemeDocId(tenantSlug),
    type: TENANT_THEME_ATTRIBUTE,
    userId: tenantSlug,
    tenantSlug,
    tier: resolvedTier,
    whiteLabel: false,
    authMethod: "username-password",
    theme: null,
    darkMode: null,
    // SAD §8.6 — default true for Enterprise, false for SMB/Professional.
    // Can be toggled per tenant in Cosmos without a re-deployment.
    features: { userAnalytics: resolvedTier === "enterprise" },
    createdAt: now,
    updatedAt: now,
  };
};

/**
 * Reads the TenantTheme document for a tenant slug. Does NOT create one —
 * see `EnsureTenantTheme` for the seed-on-first-boot flow.
 */
export const GetTenantTheme = async (
  tenantSlug: string
): Promise<ServerActionResponse<TenantTheme>> => {
  try {
    const querySpec: SqlQuerySpec = {
      query: "SELECT * FROM root r WHERE r.type=@type AND r.tenantSlug=@tenantSlug",
      parameters: [
        { name: "@type", value: TENANT_THEME_ATTRIBUTE },
        { name: "@tenantSlug", value: tenantSlug },
      ],
    };

    const { resources } = await ConfigContainer()
      .items.query<TenantTheme>(querySpec, { partitionKey: tenantSlug })
      .fetchAll();

    if (resources.length === 0) {
      return {
        status: "NOT_FOUND",
        errors: [{ message: `TenantTheme not found for slug: ${tenantSlug}` }],
      };
    }

    const parsed = TenantThemeModelSchema.safeParse(resources[0]);
    if (!parsed.success) {
      return {
        status: "ERROR",
        errors: zodErrorsToServerActionErrors(parsed.error.errors),
      };
    }

    return { status: "OK", response: parsed.data };
  } catch (error) {
    // Codex review #1 finding 7 — never interpolate the raw Cosmos error
    // (can carry connection strings / diagnostic payloads) into a message
    // that flows back through ServerActionResponse to a UI surface or log.
    safeLog.error("theme.get-failed", { tenantSlug });
    return {
      status: "ERROR",
      errors: [{ message: "Unable to load tenant theme." }],
    };
  }
};

/**
 * Seed-on-first-boot: returns the tenant's TenantTheme document, creating
 * the Sales Prism standard-theme default if none exists yet.
 *
 * This replaces the workflow-side Cosmos seeding step that provisioning
 * can no longer perform once the customer's Cosmos DB sits behind a
 * private endpoint (SAD §7.1) — the GitHub Actions runner has no network
 * path to it, so the running app seeds its own config on first request.
 */
export const EnsureTenantTheme = async (
  tenantSlug: string
): Promise<ServerActionResponse<TenantTheme>> => {
  const existing = await GetTenantTheme(tenantSlug);

  if (existing.status === "OK") {
    return existing;
  }

  if (existing.status !== "NOT_FOUND") {
    return existing;
  }

  const seeded = buildDefaultTenantTheme(tenantSlug);

  try {
    const { resource } = await ConfigContainer().items.create<TenantTheme>(seeded);

    if (resource) {
      return { status: "OK", response: resource };
    }

    safeLog.error("theme.seed-failed", { tenantSlug });
    return {
      status: "ERROR",
      errors: [{ message: "Unable to initialize tenant theme." }],
    };
  } catch (error) {
    // Cosmos raises a 409 Conflict if a concurrent request already
    // created the same deterministic id first — that's not an error,
    // it just means we lost the seed race. Read back what won.
    const status = (error as { code?: number })?.code;
    if (status === 409) {
      return await GetTenantTheme(tenantSlug);
    }

    safeLog.error("theme.seed-failed", { tenantSlug, statusCode: status });
    return {
      status: "ERROR",
      errors: [{ message: "Unable to initialize tenant theme." }],
    };
  }
};

exec
/bin/zsh -lc "sed -n '1,220p' src/features/onboarding/onboarding-actions.ts" in /Users/hugosson/workspace/SalesPrism
 succeeded in 0ms:
"use server";
import "server-only";

import { MarkOnboardingCompleted } from "@/features/admin/user-service";

/**
 * Server action for the onboarding modal's "Skip" / "Finish" buttons (Stage
 * 5c, SAD §18 Phase F). Deliberately has no return value and never throws —
 * see `MarkOnboardingCompleted`'s own doc comment: a persistence failure
 * here must never block the user from dismissing the modal client-side.
 */
export const completeOnboardingAction = async (): Promise<void> => {
  await MarkOnboardingCompleted();
};

exec
/bin/zsh -lc "sed -n '1,220p' src/features/help/help-store.ts" in /Users/hugosson/workspace/SalesPrism
 succeeded in 0ms:
"use client";

import { proxy, useSnapshot } from "valtio";

export type HelpTab = "getting-started" | "models" | "faq" | "support";

/** Help slide-over open/closed + active-tab state (Stage 5c, SAD §18 Phase F). */
class HelpUiState {
  public open: boolean = false;
  public tab: HelpTab = "getting-started";

  public openHelp(tab: HelpTab = "getting-started") {
    this.tab = tab;
    this.open = true;
  }

  public closeHelp() {
    this.open = false;
  }

  public setTab(tab: HelpTab) {
    this.tab = tab;
  }
}

export const helpStore = proxy(new HelpUiState());

export const useHelpUi = () => useSnapshot(helpStore);

exec
/bin/zsh -lc "sed -n '1,220p' src/features/onboarding/starter-prompt-store.ts" in /Users/hugosson/workspace/SalesPrism
 succeeded in 0ms:
"use client";

import { proxy } from "valtio";

/**
 * Carries a single "starter prompt" string from the onboarding modal's
 * step-3 cards across the `CreateChatAndRedirect` navigation into the newly
 * created chat thread's input field (Stage 5c, SAD §18 Phase F "2 derived
 * starter prompts deep-linking into a new chat").
 *
 * Deliberately an in-memory valtio store, NOT localStorage/sessionStorage —
 * CLAUDE.md "No localStorage for sensitive data" plus there is simply no
 * need for cross-tab/reload persistence here: `CreateChatAndRedirect` is a
 * same-tab Next.js App Router transition (server action + `redirect()`),
 * which preserves the client JS module/store state exactly like a
 * client-side `<Link>` navigation would.
 */
class StarterPromptState {
  public pending: string | null = null;

  public setPending(text: string) {
    this.pending = text;
  }

  /** Reads and clears the pending prompt in one step — consumed at most once. */
  public consume(): string | null {
    const value = this.pending;
    this.pending = null;
    return value;
  }
}

export const starterPromptStore = proxy(new StarterPromptState());

exec
/bin/zsh -lc "sed -n '1,260p' src/features/auth-page/helpers.ts" in /Users/hugosson/workspace/SalesPrism
 succeeded in 0ms:
import { createHash } from "crypto";
import { getServerSession } from "next-auth";
import { RedirectToPage } from "../common/navigation-helpers";
import { options } from "./auth-api";

export const userSession = async (): Promise<UserModel | null> => {
  const session = await getServerSession(options);
  if (session && session.user) {
    return {
      name: session.user.name!,
      image: session.user.image!,
      email: session.user.email!,
      isAdmin: session.user.isAdmin!,
    };
  }

  return null;
};

export const getCurrentUser = async (): Promise<UserModel> => {
  const user = await userSession();
  if (user) {
    return user;
  }
  throw new Error("User not found");
};

export const userHashedId = async (): Promise<string> => {
  const user = await userSession();
  if (user) {
    return hashValue(user.email);
  }

  throw new Error("User not found");
};

export const hashValue = (value: string): string => {
  const hash = createHash("sha256");
  hash.update(value);
  return hash.digest("hex");
};

export const redirectIfAuthenticated = async () => {
  const user = await userSession();
  if (user) {
    RedirectToPage("chat");
  }
};

export type UserModel = {
  name: string;
  image: string;
  email: string;
  isAdmin: boolean;
};

exec
/bin/zsh -lc "sed -n '1,320p' src/features/common/services/cosmos.ts" in /Users/hugosson/workspace/SalesPrism
 succeeded in 0ms:
import { CosmosClient } from "@azure/cosmos";
import { DefaultAzureCredential } from "@azure/identity";

// Configure Cosmos DB details
const DB_NAME = process.env.AZURE_COSMOSDB_DB_NAME || "chat";
const CONTAINER_NAME = process.env.AZURE_COSMOSDB_CONTAINER_NAME || "history";
const CONFIG_CONTAINER_NAME = process.env.AZURE_COSMOSDB_CONFIG_CONTAINER_NAME || "config";
const USE_MANAGED_IDENTITIES = process.env.USE_MANAGED_IDENTITIES === "true";

const getCosmosCredential = () => {
  if (USE_MANAGED_IDENTITIES) {
    return new DefaultAzureCredential();
  }
  const key = process.env.AZURE_COSMOSDB_KEY;
  if (!key) {
    throw new Error("Azure Cosmos DB key is not provided in environment variables.");
  }
  return key;
};

export const CosmosInstance = () => {
  const endpoint = process.env.AZURE_COSMOSDB_URI;

  if (!endpoint) {
    throw new Error(
      "Azure Cosmos DB endpoint is not configured. Please configure it in the .env file."
    );
  }

  const credential = getCosmosCredential();
  if (credential instanceof DefaultAzureCredential) {
    return new CosmosClient({ endpoint, aadCredentials: credential });
  } else {
    return new CosmosClient({ endpoint, key: credential });
  }
};

export const ConfigContainer = () => {
  const client = CosmosInstance();
  const database = client.database(DB_NAME);
  const container = database.container(CONFIG_CONTAINER_NAME);
  return container;
};

export const HistoryContainer = () => {
  const client = CosmosInstance();
  const database = client.database(DB_NAME);
  const container = database.container(CONTAINER_NAME);
  return container;
};

exec
/bin/zsh -lc "rg -n \"Record(Login|Upload|Prompt)Event|safeLog\\.|console\\.(log|error|warn|info)|userHashedId\\(|getCurrentUser\\(|getServerSession|auth\\(|cookies\\(|headers\\(|export const (GET|POST|PUT|PATCH|DELETE)|revalidatePath\\(|redirect\\(|fetch\\(\" src/features src/app | sed -n '1,260p'" in /Users/hugosson/workspace/SalesPrism
 succeeded in 0ms:
src/features/theme/tenant-theme.ts:152:    safeLog.error("theme.get-failed", { tenantSlug });
src/features/theme/tenant-theme.ts:191:    safeLog.error("theme.seed-failed", { tenantSlug });
src/features/theme/tenant-theme.ts:205:    safeLog.error("theme.seed-failed", { tenantSlug, statusCode: status });
src/app/layout.tsx:69:    const requestHeaders = await headers();
src/features/auth-page/auth-api.ts:29:          console.log("GitHub profile:", newProfile);
src/features/auth-page/auth-api.ts:63:          console.log("Azure AD profile:", newProfile);
src/features/auth-page/auth-api.ts:95:          console.log(
src/features/auth-page/auth-api.ts:110:  console.log("Fetching profile picture...");
src/features/auth-page/auth-api.ts:112:  const profilePicture = await fetch(
src/features/auth-page/auth-api.ts:121:    console.log("Profile picture fetched successfully.");
src/features/auth-page/auth-api.ts:127:    console.error("Failed to fetch profile picture:", profilePictureUrl, profilePicture.statusText);
src/features/auth-page/helpers.ts:2:import { getServerSession } from "next-auth";
src/features/auth-page/helpers.ts:7:  const session = await getServerSession(options);
src/features/admin/group-service.ts:84:    safeLog.error("admin.groups.get-failed", { tenantSlug });
src/features/admin/group-service.ts:124:    safeLog.error("admin.groups.add-failed", { tenantSlug });
src/features/admin/group-service.ts:151:    safeLog.error("admin.groups.rename-failed", { tenantSlug });
src/features/admin/group-service.ts:172:    safeLog.error("admin.groups.delete-failed", { tenantSlug });
src/features/admin/group-service.ts:201:          safeLog.error("admin.groups.rewrite-user-tag-failed", { tenantSlug });
src/features/theme/tenant-resolver.ts:63: * reads Next's `headers()` dynamic API, so it can only run in a request
src/features/theme/tenant-resolver.ts:68:  const requestHeaders = await headers();
src/features/admin/admin-guard.ts:28:  const user = await getCurrentUser();
src/features/admin/admin-guard.ts:31:    safeLog.warn("admin.access-denied");
src/features/admin/admin-guard.ts:36:  const hashedId = await userHashedId();
src/features/sales-coach/extraction-service.ts:75:        safeLog.error("sales-coach.extraction.persona-classify-failed", {
src/features/sales-coach/extraction-service.ts:103:      safeLog.error("sales-coach.extraction.upsert-failed", { tenantSlug: input.tenantSlug });
src/features/sales-coach/extraction-service.ts:106:    safeLog.error("sales-coach.extraction.failed", { tenantSlug: input.tenantSlug });
src/features/onboarding/starter-prompt-store.ts:14: * same-tab Next.js App Router transition (server action + `redirect()`),
src/features/admin/actions/group-actions.ts:18:  revalidatePath("/admin/groups");
src/features/admin/actions/group-actions.ts:30:  revalidatePath("/admin/groups");
src/features/admin/actions/group-actions.ts:31:  revalidatePath("/admin/users");
src/features/admin/actions/group-actions.ts:37:  revalidatePath("/admin/groups");
src/features/admin/actions/group-actions.ts:38:  revalidatePath("/admin/users");
src/features/sales-coach/actor-context.ts:19:    userHashedId(),
src/features/admin/actions/user-actions.ts:55:    safeLog.warn("admin.users.create-rejected");
src/features/admin/actions/user-actions.ts:59:  revalidatePath("/admin/users");
src/features/admin/actions/user-actions.ts:60:  redirect("/admin/users");
src/features/admin/actions/user-actions.ts:79:  revalidatePath("/admin/users");
src/features/admin/actions/user-actions.ts:80:  redirect("/admin/users");
src/features/admin/actions/user-actions.ts:89:  revalidatePath("/admin/users");
src/features/admin/actions/user-actions.ts:95:  revalidatePath("/admin/users");
src/features/admin/user-service.ts:57:   * SHA-256 hash of the authenticated user's email (`userHashedId()`) —
src/features/admin/user-service.ts:123:    safeLog.error("admin.users.list-failed", { tenantSlug });
src/features/admin/user-service.ts:142:    safeLog.error("admin.users.get-failed", { tenantSlug });
src/features/admin/user-service.ts:171:    safeLog.error("admin.users.lookup-by-hash-failed", { tenantSlug });
src/features/admin/user-service.ts:193:    const user = await getCurrentUser();
src/features/admin/user-service.ts:194:    const hashedId = await userHashedId();
src/features/admin/user-service.ts:256:      safeLog.error("admin.users.ensure-on-login-failed");
src/features/admin/user-service.ts:276:    const hashedId = await userHashedId();
src/features/admin/user-service.ts:303:    const hashedId = await userHashedId();
src/features/admin/user-service.ts:312:    safeLog.error("admin.users.mark-onboarding-completed-failed");
src/features/admin/user-service.ts:362:    safeLog.error("admin.users.create-failed", { statusCode: code });
src/features/admin/user-service.ts:397:    safeLog.error("admin.users.update-failed", { tenantSlug });
src/features/admin/user-service.ts:420:    safeLog.error("admin.users.set-status-failed", { tenantSlug });
src/features/reporting-page/reporting-services/reporting-service.ts:16:  const user = await getCurrentUser();
src/features/reporting-page/reporting-services/reporting-service.ts:63:  const user = await getCurrentUser();
src/features/extensions-page/extension-services/extension-service.ts:84:    const user = await getCurrentUser();
src/features/extensions-page/extension-services/extension-service.ts:101:      userId: await userHashedId(),
src/features/extensions-page/extension-services/extension-service.ts:167:  const currentUser = await getCurrentUser();
src/features/extensions-page/extension-services/extension-service.ts:168:  const hashedId = await userHashedId();
src/features/extensions-page/extension-services/extension-service.ts:273:    const user = await getCurrentUser();
src/features/extensions-page/extension-services/extension-service.ts:356:          value: await userHashedId(),
src/features/extensions-page/extension-services/extension-service.ts:392:      userId: await userHashedId(),
src/app/(authenticated)/api/speech/synthesize/route.ts:19: * already gates `/api/speech/:path*`, `userHashedId()` re-checks here too.
src/app/(authenticated)/api/speech/synthesize/route.ts:25:    await userHashedId();
src/app/(authenticated)/api/speech/synthesize/route.ts:76:    safeLog.error("speech.synthesize-failed", { requestId });
src/features/common/services/ai-search.ts:17:console.log("Configuration parameters:", {
src/features/common/services/ai-search.ts:26:  if (debug) console.log("Credential obtained via DefaultAzureCredential");
src/features/common/services/ai-search.ts:31:  console.log("Creating Azure AI Search Client Instance");
src/features/common/services/ai-search.ts:40:  console.log("Search Client created:", searchClient);
src/features/common/services/ai-search.ts:45:  console.log("Creating Azure AI Search Index Client Instance");
src/features/common/services/ai-search.ts:53:  console.log("Search Index Client created:", searchClient);
src/features/common/services/ai-search.ts:58:  console.log("Creating Azure AI Search Indexer Client Instance");
src/features/common/services/ai-search.ts:66:  console.log("Search Indexer Client created:", client);
src/app/(authenticated)/api/speech/transcribe/route.ts:25: * `/api/speech/:path*` request; `userHashedId()` re-checks explicitly here
src/app/(authenticated)/api/speech/transcribe/route.ts:41:    await userHashedId();
src/app/(authenticated)/api/speech/transcribe/route.ts:102:    safeLog.error("speech.transcribe-failed", { requestId });
src/features/admin/activity-service.ts:76:    safeLog.error("admin.activity.record-failed", { tenantSlug, eventType });
src/features/admin/activity-service.ts:80:export const RecordPromptEvent = async (props: {
src/features/admin/activity-service.ts:95:export const RecordUploadEvent = async (props: {
src/features/admin/activity-service.ts:100:export const RecordLoginEvent = async (props: {
src/features/admin/activity-service.ts:155:    safeLog.error("admin.activity.list-failed", { tenantSlug });
src/features/common/services/safe-logger.test.ts:27:    safeLog.error("some.event.code");
src/features/common/services/safe-logger.test.ts:33:    safeLog.info("event", {
src/features/common/services/safe-logger.test.ts:65:    safeLog.warn("event", { tenantSlug: "dsv" });
src/features/common/services/safe-logger.test.ts:71:    safeLog.error("event.only");
src/features/common/services/safe-logger.test.ts:89:    } as unknown as Parameters<typeof safeLog.error>[1];
src/features/common/services/safe-logger.test.ts:91:    safeLog.error("event", fieldsWithUnexpectedKey);
src/features/common/services/safe-logger.test.ts:102:    } as unknown as Parameters<typeof safeLog.error>[1];
src/features/common/services/safe-logger.test.ts:104:    safeLog.error("event", fieldsWithOnlyUnexpectedKey);
src/features/common/services/safe-logger.test.ts:110:    safeLog.error("e");
src/features/common/services/safe-logger.test.ts:111:    safeLog.warn("w");
src/features/common/services/safe-logger.test.ts:112:    safeLog.info("i");
src/features/prompt-page/prompt-service.ts:21:    const user = await getCurrentUser();
src/features/prompt-page/prompt-service.ts:39:      userId: await userHashedId(),
src/features/prompt-page/prompt-service.ts:119:  const currentUser = await getCurrentUser();
src/features/prompt-page/prompt-service.ts:224:      const user = await getCurrentUser();
src/features/sales-coach/actions/customer-actions.ts:36:  const ownerHashedId = await userHashedId();
src/features/sales-coach/actions/customer-actions.ts:53:    safeLog.warn("sales-coach.customers.update-rejected", { tenantSlug });
src/features/sales-coach/actions/customer-actions.ts:57:  revalidatePath(`/customers/${customerId}`);
src/features/sales-coach/actions/customer-actions.ts:67:  const ownerHashedId = await userHashedId();
src/features/sales-coach/actions/customer-actions.ts:84:    safeLog.warn("sales-coach.customers.notes-update-rejected", { tenantSlug });
src/features/sales-coach/actions/customer-actions.ts:88:  revalidatePath(`/customers/${customerId}`);
src/app/(authenticated)/api/speech/cleanup/route.ts:41:    safeLog.error("speech.cleanup-route-failed", { requestId });
src/features/common/services/safe-logger.ts:6: * The chat handler previously did `console.error("...", error)` /
src/features/common/services/safe-logger.ts:7: * `console.error("...", errors)` with raw SDK error objects and
src/features/common/services/safe-logger.ts:10: * console.error/warn/info in production is customer telemetry — and those
src/features/common/services/safe-logger.ts:34:  /** SHA-256 hash of the user's email (see `userHashedId()`) — never the raw email/name. */
src/features/sales-coach/meeting-brief-service.ts:82:    safeLog.error("sales-coach.meeting-brief.create-failed", { tenantSlug: input.tenantSlug });
src/features/sales-coach/meeting-brief-service.ts:109:    safeLog.error("sales-coach.meeting-brief.list-failed", { tenantSlug });
src/features/sales-coach/meeting-brief-service.ts:134:    safeLog.error("sales-coach.meeting-brief.get-failed", { tenantSlug });
src/features/common/navigation-helpers.ts:14:    revalidatePath(`/${page}/${params}`, type);
src/features/common/navigation-helpers.ts:16:    revalidatePath(`/${page}`, type);
src/features/common/navigation-helpers.ts:21:  redirect(`/${path}`);
src/features/common/navigation-helpers.ts:25:  redirect(`/chat/${chatThreadId}`);
src/features/common/services/document-intelligence.ts:10:  console.log("Document Intelligence Endpoint:", endpoint);
src/features/common/services/document-intelligence.ts:21:  if (debug) console.log("Document Analysis Client created:", client);
src/features/chat-page/chat-store.tsx:156:      const response = await fetch("/api/chat", {
src/features/chat-page/chat-store.tsx:177:        onError: (error) => console.error("🔴 chat stream error:", error),
src/features/chat-page/chat-services/chat-thread-service.test.ts:8:// control userHashedId()/getCurrentUser() per test to simulate "owner",
src/features/sales-coach/components/meeting-brief-embed.tsx:26:    fetch(`/api/sales-coach/meeting-briefs/${id}`)
src/features/persona-page/persona-services/persona-service.ts:79:    const user = await getCurrentUser();
src/features/persona-page/persona-services/persona-service.ts:87:      userId: await userHashedId(),
src/features/persona-page/persona-services/persona-service.ts:133:  const currentUser = await getCurrentUser();
src/features/persona-page/persona-services/persona-service.ts:134:  const hashedId = await userHashedId();
src/features/persona-page/persona-services/persona-service.ts:190:      const user = await getCurrentUser();
src/features/persona-page/persona-services/persona-service.ts:260:          value: await userHashedId(),
src/features/persona-page/persona-services/persona-service.ts:289:  const user = await getCurrentUser();
src/features/persona-page/persona-services/persona-service.ts:297:      userId: await userHashedId(),
src/app/(authenticated)/api/sales-coach/meeting-briefs/[id]/route.ts:22:      userHashedId(),
src/features/chat-page/chat-services/azure-ai-search/azure-ai-search.ts:39:    if (debug) console.log("Executing SimpleSearch with searchText:", searchText, "filter:", filter);
src/features/chat-page/chat-services/azure-ai-search/azure-ai-search.ts:51:    if (debug) console.log("SimpleSearch results:", results);
src/features/chat-page/chat-services/azure-ai-search/azure-ai-search.ts:57:    console.error("SimpleSearch error:", e);
src/features/chat-page/chat-services/azure-ai-search/azure-ai-search.ts:75:    if (debug) console.log("Executing SimilaritySearch with searchText:", searchText, "k:", k, "filter:", filter);
src/features/chat-page/chat-services/azure-ai-search/azure-ai-search.ts:81:    if (debug) console.log("Embedding obtained, dimensions:", embedding.length);
src/features/chat-page/chat-services/azure-ai-search/azure-ai-search.ts:107:    if (debug) console.log("SimilaritySearch results:", results);
src/features/chat-page/chat-services/azure-ai-search/azure-ai-search.ts:113:    console.error("SimilaritySearch error:", e);
src/features/chat-page/chat-services/azure-ai-search/azure-ai-search.ts:138:    if (debug) console.log("Indexing documents with fileName:", fileName, "chatThreadId:", chatThreadId);
src/features/chat-page/chat-services/azure-ai-search/azure-ai-search.ts:145:        user: await userHashedId(),
src/features/chat-page/chat-services/azure-ai-search/azure-ai-search.ts:154:    if (debug) console.log("Documents to index:", documentsToIndex);
src/features/chat-page/chat-services/azure-ai-search/azure-ai-search.ts:183:      if (debug) console.log("IndexDocuments response:", response);
src/features/chat-page/chat-services/azure-ai-search/azure-ai-search.ts:189:    console.error("IndexDocuments error:", e);
src/features/chat-page/chat-services/azure-ai-search/azure-ai-search.ts:207:    if (debug) console.log("Deleting documents for chatThreadId:", chatThreadId);
src/features/chat-page/chat-services/azure-ai-search/azure-ai-search.ts:238:      if (debug) console.log("DeleteDocuments response:", response);
src/features/chat-page/chat-services/azure-ai-search/azure-ai-search.ts:244:    console.error("DeleteDocuments error:", e);
src/features/chat-page/chat-services/azure-ai-search/azure-ai-search.ts:262:    if (debug) console.log("Embedding documents:", documents.map((d) => d.id));
src/features/chat-page/chat-services/azure-ai-search/azure-ai-search.ts:270:    if (debug) console.log(`Embeddings received: ${embeddings.length}`);
src/features/chat-page/chat-services/azure-ai-search/azure-ai-search.ts:276:    if (debug) console.log("Documents after embedding:", documents);
src/features/chat-page/chat-services/azure-ai-search/azure-ai-search.ts:282:    console.error("EmbedDocuments error:", e);
src/features/chat-page/chat-services/azure-ai-search/azure-ai-search.ts:298:    console.log("Ensuring index is created: ", process.env.AZURE_SEARCH_INDEX_NAME);
src/features/chat-page/chat-services/azure-ai-search/azure-ai-search.ts:301:    console.log("Index exists: ", result);
src/features/chat-page/chat-services/azure-ai-search/azure-ai-search.ts:307:    console.log(`Error Creating index:${e}`);
src/features/chat-page/chat-services/azure-ai-search/azure-ai-search.ts:316:    console.log("Creating search index");
src/features/chat-page/chat-services/azure-ai-search/azure-ai-search.ts:382:    console.log("Search index created:", result);
src/features/chat-page/chat-services/azure-ai-search/azure-ai-search.ts:388:    console.error("CreateSearchIndex error:", e);
src/app/(authenticated)/admin/page.tsx:4:  redirect("/admin/users");
src/features/sales-coach/stt-cleanup.ts:69:    safeLog.warn("sales-coach.stt-cleanup-failed");
src/features/chat-page/chat-services/chat-message-service.ts:30:          value: await userHashedId(),
src/features/chat-page/chat-services/chat-message-service.ts:81:          value: await userHashedId(),
src/features/chat-page/chat-services/chat-message-service.ts:123:  const userId = await userHashedId();
src/features/chat-page/chat-services/chat-thread-service.ts:41:          value: await userHashedId(),
src/features/chat-page/chat-services/chat-thread-service.ts:52:        partitionKey: await userHashedId(),
src/features/chat-page/chat-services/chat-thread-service.ts:81:          value: await userHashedId(),
src/features/chat-page/chat-services/chat-thread-service.ts:183:  const currentUser = await getCurrentUser();
src/features/chat-page/chat-services/chat-thread-service.ts:184:  const hashedId = await userHashedId();
src/features/chat-page/chat-services/chat-thread-service.ts:292:      userId: await userHashedId(),
src/features/chat-page/chat-services/citation-service.ts:48:      userId: userId || (await userHashedId()),
src/features/chat-page/chat-services/citation-service.ts:75:          value: await userHashedId(),
src/features/sales-coach/context-injection.ts:98:    safeLog.error("sales-coach.module-config.get-failed", { tenantSlug });
src/features/sales-coach/context-injection.ts:115:    safeLog.error("sales-coach.module-config.seed-failed", { tenantSlug });
src/features/sales-coach/context-injection.ts:122:    safeLog.error("sales-coach.module-config.seed-failed", { tenantSlug, statusCode: code });
src/features/chat-page/chat-input/speech/use-text-to-speech.ts:41:      const response = await fetch("/api/speech/synthesize", {
src/app/(authenticated)/admin/layout.tsx:17: * `getCurrentUser()` (auth-page helpers, read-only for this change) inside
src/app/(authenticated)/admin/layout.tsx:26:  const user = await getCurrentUser();
src/app/(authenticated)/admin/layout.tsx:29:    redirect("/unauthorized");
src/features/chat-page/chat-services/chat-handler.ts:4:import { RecordPromptEvent } from "@/features/admin/activity-service";
src/features/chat-page/chat-services/chat-handler.ts:68:    getCurrentUser(),
src/features/chat-page/chat-services/chat-handler.ts:69:    userHashedId(),
src/features/chat-page/chat-services/chat-handler.ts:202:      await RecordPromptEvent({
src/features/chat-page/chat-services/chat-handler.ts:214:      safeLog.info("chat.model-router.usage", {
src/features/chat-page/chat-services/chat-handler.ts:240:      safeLog.error("chat.stream-error", {
src/features/chat-page/chat-services/chat-handler.ts:270:  safeLog.error("chat.history-lookup-failed", {
src/features/chat-page/chat-services/chat-handler.ts:284:  safeLog.error("chat.document-lookup-failed", {
src/features/main-menu/main-menu.tsx:31:  const user = await getCurrentUser();
src/features/sales-coach/customer-entity-service.ts:67:    safeLog.error("sales-coach.customers.list-failed", { tenantSlug });
src/features/sales-coach/customer-entity-service.ts:87:    safeLog.error("sales-coach.customers.get-failed", { tenantSlug });
src/features/sales-coach/customer-entity-service.ts:119:    safeLog.error("sales-coach.customers.lookup-by-name-failed", { tenantSlug });
src/features/sales-coach/customer-entity-service.ts:163:    safeLog.error("sales-coach.customers.create-failed", { tenantSlug: input.tenantSlug, statusCode: code });
src/features/sales-coach/customer-entity-service.ts:199:    safeLog.error("sales-coach.customers.update-failed", { tenantSlug });
src/features/sales-coach/customer-entity-service.ts:305:    safeLog.error("sales-coach.customers.interaction-update-failed", { tenantSlug });
src/features/sales-coach/customer-entity-service.ts:345:    safeLog.error("sales-coach.customers.link-brief-failed", { tenantSlug: input.tenantSlug });
src/features/chat-page/chat-input/speech/use-speech-to-text.ts:75:      const response = await fetch("/api/speech/transcribe", {
src/features/chat-page/chat-input/speech/use-speech-to-text.ts:120:      const response = await fetch("/api/speech/cleanup", {
src/features/chat-page/chat-services/chat-document-service.ts:4:import { RecordUploadEvent } from "@/features/admin/activity-service";
src/features/chat-page/chat-services/chat-document-service.ts:27:    if (debug) console.log("CrackDocument: Ensuring index is created.");
src/features/chat-page/chat-services/chat-document-service.ts:30:      if (debug) console.log("CrackDocument: Index is created, loading file.");
src/features/chat-page/chat-services/chat-document-service.ts:33:        if (debug) console.log("CrackDocument: File loaded successfully, splitting documents.");
src/features/chat-page/chat-services/chat-document-service.ts:38:        if (debug) console.log("CrackDocument: Documents split successfully.");
src/features/chat-page/chat-services/chat-document-service.ts:45:      console.error("CrackDocument: File loading failed.", fileResponse.errors);
src/features/chat-page/chat-services/chat-document-service.ts:49:    console.error("CrackDocument: Index creation failed.", response.errors);
src/features/chat-page/chat-services/chat-document-service.ts:52:    console.error("CrackDocument error:", e);
src/features/chat-page/chat-services/chat-document-service.ts:68:    if (debug) console.log("LoadFile: Loading file from form data.");
src/features/chat-page/chat-services/chat-document-service.ts:76:      if (debug) console.log("LoadFile: File size is within the acceptable limit.");
src/features/chat-page/chat-services/chat-document-service.ts:81:      if (debug) console.log("LoadFile: Beginning document analysis.");
src/features/chat-page/chat-services/chat-document-service.ts:94:        if (debug) console.log("LoadFile: Document analysis completed successfully.");
src/features/chat-page/chat-services/chat-document-service.ts:102:      console.error("LoadFile: File size is too large.");
src/features/chat-page/chat-services/chat-document-service.ts:113:    console.error("LoadFile error:", e);
src/features/chat-page/chat-services/chat-document-service.ts:129:    if (debug) console.log("FindAllChatDocuments: Searching documents for chatThreadID:", chatThreadID);
src/features/chat-page/chat-services/chat-document-service.ts:154:      if (debug) console.log(`FindAllChatDocuments: ${resources.length} Documents found.`);
src/features/chat-page/chat-services/chat-document-service.ts:160:      console.error("FindAllChatDocuments: No documents found.");
src/features/chat-page/chat-services/chat-document-service.ts:171:    console.error("FindAllChatDocuments error:", e);
src/features/chat-page/chat-services/chat-document-service.ts:188:    if (debug) console.log("CreateChatDocument: Creating document with fileName:", fileName, "chatThreadID:", chatThreadID);
src/features/chat-page/chat-services/chat-document-service.ts:192:      userId: await userHashedId(),
src/features/chat-page/chat-services/chat-document-service.ts:206:      if (debug) console.log("CreateChatDocument: Document created successfully.");
src/features/chat-page/chat-services/chat-document-service.ts:210:      await RecordUploadEvent({ tenantSlug, actorHashedId: modelToSave.userId });
src/features/chat-page/chat-services/chat-document-service.ts:218:    console.error("CreateChatDocument: Unable to save chat document.");
src/features/chat-page/chat-services/chat-document-service.ts:228:    console.error("CreateChatDocument error:", e);
src/features/chat-page/chat-services/chat-document-service.ts:243:  if (debug) console.log("ChunkDocumentWithOverlap: Starting chunking process.");
src/features/chat-page/chat-services/chat-document-service.ts:247:    if (debug) console.log("ChunkDocumentWithOverlap: Document length is within single chunk size.");
src/features/chat-page/chat-services/chat-document-service.ts:261:  if (debug) console.log("ChunkDocumentWithOverlap: Chunking completed.", chunks);
src/features/sales-coach/meeting-prep-tool.ts:71:          safeLog.error("sales-coach.meeting-prep.save-failed", { tenantSlug });
src/features/sales-coach/meeting-prep-tool.ts:81:        safeLog.error("sales-coach.meeting-prep.generate-failed", { tenantSlug });
src/features/chat-page/chat-services/model-router.ts:136: * always-available default deployment) and logs the failure via safeLog.
src/features/chat-page/chat-services/model-router.ts:151:    safeLog.warn("chat.model-router.classifier-failed", { requestId });
src/features/chat-page/chat-services/model-router.ts:171: * `RecordPromptEvent`'s `process.env.PLATFORM_TIER || "smb"` fallback in

codex
I have enough of the request path now. I’m checking the lifecycle side next: whether the new Cosmos document types ever age out, whether deletion can actually remove a seller’s/customer’s new artifacts, and whether admin/activity data can outlive the rest of a data-subject purge.
exec
/bin/zsh -lc "sed -n '1,320p' src/features/sales-coach/models.ts" in /Users/hugosson/workspace/SalesPrism
 succeeded in 0ms:
import { z } from "zod";

/**
 * Sales Coach 360 — shared domain schemas (SHARED 1/2/3, Stage 5b / Phase E).
 *
 * Backlog reference: docs/Sales_Coach_360_Feature_Backlog.md F-01..F-04.
 * SAD reference: docs/Sales_Prism_SAD_v2.7.md §18 Phase E, §27 (learning
 * modules), §30 (persona architecture).
 *
 * Cosmos container/partition convention — IMPORTANT DEVIATION FROM THE
 * BACKLOG'S ILLUSTRATIVE JSON: the backlog's example customer-entity JSON
 * (F-03) names its per-seller identity field "userId" (e.g.
 * "usr-peter-hansen"). This app's `ConfigContainer` (see
 * src/features/common/services/cosmos.ts) has a FIXED partition key path of
 * `/userId`, and the established convention for every other tenant-scoped
 * document in this codebase (TenantTheme, UserAccount, ActivityEvent — see
 * tenant-theme.ts / user-service.ts / activity-service.ts) is: the `userId`
 * field on the DOCUMENT holds the *tenant slug* (so "all docs for my
 * tenant" is always a single, cheap, partition-scoped query), and the
 * actual acting/owning user's SHA-256 hashed identity is carried in a
 * separate, differently-named field (`hashedId` / `actorHashedId`).
 *
 * Customer-entity and meeting-brief documents follow that SAME convention
 * here, not the backlog's literal field name, to stay consistent with every
 * other container-owning service in the app. The per-seller identity field
 * is named `ownerHashedId` and — per the Stage 5b brief — is included in
 * EVERY query filter alongside the tenant partition key. This is a hard
 * security boundary: a seller's customer intelligence is private to that
 * seller, and omitting `ownerHashedId` from a query filter is a
 * cross-user data leakage bug.
 */

export const CUSTOMER_ENTITY_ATTRIBUTE = "SALES_COACH_CUSTOMER_ENTITY";
export const MODULE_CONFIG_ATTRIBUTE = "SALES_COACH_MODULE_CONFIG";
export const MEETING_BRIEF_ATTRIBUTE = "SALES_COACH_MEETING_BRIEF";

/**
 * The 7 Sales Coach modules — SAD §27.2. Lives here (not context-injection.ts,
 * which re-exports it for backward compatibility) specifically so it stays
 * importable from CLIENT components: this file has no `"server-only"` pragma,
 * while context-injection.ts is server-only end-to-end (Cosmos + prompt
 * assembly). The Help panel's "The 7 models" tab (Stage 5c, SAD §18 Phase F)
 * needs this exact registry client-side without pulling in Cosmos.
 */
export type SalesCoachModuleDefinition = {
  key: ModuleKey;
  name: string;
  essence: string;
};

/**
 * The 7 Sales Coach modules — SAD §27.2. Names + "methodology essence"
 * (2-3 sentence guidance strings, written from the SAD/backlog
 * descriptions) live in code, not Cosmos — only the per-tenant
 * active/order/customName/contentOverride toggle state is persisted
 * (`ModuleConfig`, §27.3, see context-injection.ts). `context-injection.ts`
 * re-exports both constants below for backward compatibility with existing
 * imports — this file is the source of truth (see the doc-comment above
 * `SalesCoachModuleDefinition`).
 */
export const SALES_COACH_MODULE_REGISTRY: Record<ModuleKey, SalesCoachModuleDefinition> = {
  "module-01": {
    key: "module-01",
    name: "1st Position vs 2nd Position Model",
    essence:
      "Seek first to understand, then to be understood. 1st Position communication starts from your own products, features and agenda; 2nd Position starts from the customer's world — their vision, situation and language. Help the seller notice when they slip into 1st Position and reframe toward 2nd Position openings.",
  },
  "module-02": {
    key: "module-02",
    name: "360° Customer Understanding Model",
    essence:
      "Understand the customer's business far beyond their logo: their strategic vision, tactical initiatives and day-to-day operational reality. A complete picture spans all three levels — strategic, tactical and operational — not just the person in front of you.",
  },
  "module-03": {
    key: "module-03",
    name: "Personas & Stakeholder Model",
    essence:
      "Map decision-makers, influencers and stakeholders by organisational level (strategic/tactical/operational) and persona archetype. Each persona has a primary value language, known triggers and a communication style that works — and one that doesn't.",
  },
  "module-04": {
    key: "module-04",
    name: "Value Conversation Model",
    essence:
      "Speak the customer's value language across five value areas: Speed & Agility, People & Processes, Risk & Governance, Economics & Control, and Sustainability & Responsibility. Lead discovery and framing with the value area(s) most relevant to this stakeholder, not a generic pitch.",
  },
  "module-05": {
    key: "module-05",
    name: "Why–What–How–Value Model",
    essence:
      "Communicate with purpose: understand the customer's Why before presenting What you do, How you do it, or what Value it creates. Sequencing matters — leading with What/How before establishing Why reverts the conversation to 1st Position.",
  },
  "module-06": {
    key: "module-06",
    name: "Continuous Lifecycle & Partnership Model",
    essence:
      "Move from vendor to trusted strategic partner across the full customer lifecycle — not just the sale. Look for opportunities to reinforce partnership value at every touchpoint, before and after the deal closes.",
  },
  "module-07": {
    key: "module-07",
    name: "Questionary & Active Listening Model",
    essence:
      "Curiosity with structure creates understanding. Use open, layered questioning (not a checklist) combined with active listening to surface what the customer hasn't said explicitly yet — the real challenge behind the stated one.",
  },
};

export const ALL_MODULE_KEYS: ModuleKey[] = [
  "module-01",
  "module-02",
  "module-03",
  "module-04",
  "module-05",
  "module-06",
  "module-07",
];

/**
 * The 5 Value Conversation Model value areas (SAD §27.2 module-04 / DESIGN.md
 * value-area mini-cards).
 */
export const ValueAreaSchema = z.enum([
  "speed-agility",
  "people-processes",
  "risk-governance",
  "economics-control",
  "sustainability-responsibility",
]);
export type ValueArea = z.infer<typeof ValueAreaSchema>;

export const VALUE_AREA_LABELS: Record<ValueArea, string> = {
  "speed-agility": "Speed & Agility",
  "people-processes": "People & Processes",
  "risk-governance": "Risk & Governance",
  "economics-control": "Economics & Control",
  "sustainability-responsibility": "Sustainability & Responsibility",
};

/** Personas & Stakeholder Model (SAD §27.2 module-03) organisational level. */
export const OrgLevelSchema = z.enum(["strategic", "tactical", "operational"]);
export type OrgLevel = z.infer<typeof OrgLevelSchema>;

/**
 * Persona archetypes — two per organisational level, matching the shape of
 * the backlog's F-04 worked example ("Tactical — The Translator"). The SAD
 * does not enumerate the full archetype list verbatim, so this set is a
 * deliberate, documented product decision for the Personas & Stakeholder
 * Model (module-03) classifier — revisit with Kristjan/Carsten if the Sales
 * Coach methodology defines a different canonical list.
 */
export const PersonaTypeSchema = z.enum([
  "strategic-visionary",
  "strategic-guardian",
  "tactical-translator",
  "tactical-coordinator",
  "operational-specialist",
  "operational-gatekeeper",
]);
export type PersonaType = z.infer<typeof PersonaTypeSchema>;

export const PERSONA_TYPE_LABELS: Record<PersonaType, string> = {
  "strategic-visionary": "Strategic — The Visionary",
  "strategic-guardian": "Strategic — The Guardian",
  "tactical-translator": "Tactical — The Translator",
  "tactical-coordinator": "Tactical — The Coordinator",
  "operational-specialist": "Operational — The Specialist",
  "operational-gatekeeper": "Operational — The Gatekeeper",
};

export const PERSONA_TYPE_ORG_LEVEL: Record<PersonaType, OrgLevel> = {
  "strategic-visionary": "strategic",
  "strategic-guardian": "strategic",
  "tactical-translator": "tactical",
  "tactical-coordinator": "tactical",
  "operational-specialist": "operational",
  "operational-gatekeeper": "operational",
};

export const CustomerContactSchema = z.object({
  name: z.string(),
  title: z.string(),
  personaType: PersonaTypeSchema.nullable(),
  primaryValueArea: ValueAreaSchema.nullable(),
  secondaryValueArea: ValueAreaSchema.nullable().optional(),
  knownTriggers: z.array(z.string()).default([]),
  communicationTips: z.array(z.string()).default([]),
  suggestedQuestions: z.array(z.string()).default([]),
  notes: z.string().default(""),
});
export type CustomerContact = z.infer<typeof CustomerContactSchema>;

/**
 * Customer-entity — F-03 persistent customer intelligence. Cosmos document
 * shape per backlog F-03 §Datamodel, adjusted for the `ownerHashedId`
 * partition/ownership convention documented in the module doc-comment above.
 */
export const CustomerEntitySchema = z.object({
  id: z.string(),
  type: z.literal(CUSTOMER_ENTITY_ATTRIBUTE),
  /** Cosmos partition key — set to `tenantSlug`, see module doc above. */
  userId: z.string(),
  tenantSlug: z.string(),
  /** SHA-256 hash of the owning seller's email — the seller-scoping boundary. Never the raw email. */
  ownerHashedId: z.string(),
  customerName: z.string(),
  /** Lowercased/trimmed `customerName`, for case-insensitive `FindByCustomerName` lookups. */
  customerNameNormalized: z.string(),
  contacts: z.array(CustomerContactSchema).default([]),
  knownChallenges: z.array(z.string()).default([]),
  /** ISO date string of the most recent chat interaction that touched this customer. */
  lastInteraction: z.string(),
  /** Saved MeetingBrief document ids (F-01), most recent last. */
  meetingHistory: z.array(z.string()).default([]),
  valueAreas: z.array(ValueAreaSchema).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CustomerEntity = z.infer<typeof CustomerEntitySchema>;

/** SAD §27.2 — the 7 standard Sales Coach modules. */
export const ModuleKeySchema = z.enum([
  "module-01",
  "module-02",
  "module-03",
  "module-04",
  "module-05",
  "module-06",
  "module-07",
]);
export type ModuleKey = z.infer<typeof ModuleKeySchema>;

/** Per-tenant module toggle/order entry — SAD §27.3. */
export const ModuleConfigEntrySchema = z.object({
  key: ModuleKeySchema,
  active: z.boolean(),
  order: z.number().int(),
  customName: z.string().nullable(),
  language: z.string(),
  /** Points at a customer-specific content override (Atea-model, SAD §27.4) — not resolved by this shared component. */
  contentOverride: z.string().nullable(),
});
export type ModuleConfigEntry = z.infer<typeof ModuleConfigEntrySchema>;

export const ModuleConfigSchema = z.object({
  id: z.string(),
  type: z.literal(MODULE_CONFIG_ATTRIBUTE),
  /** Cosmos partition key — set to `tenantSlug`, see module doc above. */
  userId: z.string(),
  tenantSlug: z.string(),
  modules: z.array(ModuleConfigEntrySchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ModuleConfig = z.infer<typeof ModuleConfigSchema>;

/** F-01 meeting brief — one value-area theme with an impact rating (DESIGN.md §5.3 mini-card). */
export const MeetingBriefValueThemeSchema = z.object({
  valueArea: ValueAreaSchema,
  theme: z.string(),
  impact: z.enum(["low", "medium", "high"]),
});
export type MeetingBriefValueTheme = z.infer<typeof MeetingBriefValueThemeSchema>;

export const MeetingBriefDiscoveryQuestionsSchema = z.object({
  personaType: PersonaTypeSchema,
  questions: z.array(z.string()).min(1),
});

export const MeetingBriefFramingSchema = z.object({
  type: z.enum(["burning-platform", "burning-ambition"]),
  narrative: z.string(),
});

/** Structured MeetingBrief document body — see structured-output.ts for the generation schema. */
export const MeetingBriefSchema = z.object({
  customerName: z.string(),
  meetingTopic: z.string(),
  /** 2nd Position opening questions (backlog F-01 acceptance criterion). */
  openingQuestions: z.array(z.string()).min(2),
  valueAreaThemes: z.array(MeetingBriefValueThemeSchema),
  discoveryQuestionsByPersona: z.array(MeetingBriefDiscoveryQuestionsSchema),
  framing: MeetingBriefFramingSchema,
  nextSteps: z.array(z.string()).default([]),
});
export type MeetingBrief = z.infer<typeof MeetingBriefSchema>;

/** Saved/persisted MeetingBrief Cosmos document (F-01: "Brief kan gemmes og genåbnes"). */
export const MeetingBriefDocumentSchema = z.object({
  id: z.string(),
  type: z.literal(MEETING_BRIEF_ATTRIBUTE),
  /** Cosmos partition key — set to `tenantSlug`, see module doc above. */
  userId: z.string(),
  tenantSlug: z.string(),
  ownerHashedId: z.string(),
  chatThreadId: z.string(),
  customerEntityId: z.string().nullable(),
  brief: MeetingBriefSchema,
  createdAt: z.string(),
});
export type MeetingBriefDocument = z.infer<typeof MeetingBriefDocumentSchema>;

exec
/bin/zsh -lc "sed -n '1,260p' src/app/'(authenticated)'/layout.tsx" in /Users/hugosson/workspace/SalesPrism
exec
/bin/zsh -lc 'rg -n "ttl|retention|delete|Delete|remove|offboard|purge|erase|right to be forgotten|onboardingCompletedAt|ACTIVITY_EVENT|USER_ACCOUNT|MEETING_BRIEF|CUSTOMER_ENTITY|MODULE_CONFIG|TENANT_THEME" src docs' in /Users/hugosson/workspace/SalesPrism
 succeeded in 0ms:
import { EnsureUserOnLogin, GetOnboardingStatus } from "@/features/admin/user-service";
import { isSpeechConfigured } from "@/features/common/services/azure-speech";
import { HelpPanel } from "@/features/help/help-panel";
import { AuthenticatedProviders } from "@/features/globals/providers";
import { MainMenu } from "@/features/main-menu/main-menu";
import { OnboardingController } from "@/features/onboarding/onboarding-controller";
import { AI_NAME } from "@/features/theme/theme-config";
import { cn } from "@/ui/lib";

export const dynamic = "force-dynamic";

export const metadata = {
  title: AI_NAME,
  description: AI_NAME,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // SAD §8.4 — lazily upserts the admin user directory entry + a throttled
  // `lastLoginAt` on first authenticated request. NextAuth's own callback
  // (src/features/auth-page/auth-api.ts) is read-only for this change, so
  // this wraps every authenticated route instead (see EnsureUserOnLogin
  // doc-comment). Best-effort — never throws, so a Cosmos hiccup here can
  // never block the whole authenticated app shell from rendering.
  await EnsureUserOnLogin();

  // Stage 5c, SAD §18 Phase F — resolved once per request, right after
  // `EnsureUserOnLogin` so the caller's own directory entry is guaranteed
  // to exist by the time this runs (see `GetOnboardingStatus` doc comment).
  const onboardingStatus = await GetOnboardingStatus();

  return (
    <AuthenticatedProviders speechEnabled={isSpeechConfigured()}>
      <div className={cn("flex flex-1 items-stretch")}>
        <MainMenu />
        <div className="flex-1 flex">{children}</div>
      </div>
      <OnboardingController initiallyCompleted={onboardingStatus.completed} />
      <HelpPanel />
    </AuthenticatedProviders>
  );
}

 succeeded in 0ms:
docs/reviews/codex-review-1-infra-pipeline.md:320:   241	  # NEVER deletes any DNS record.
docs/reviews/codex-review-1-infra-pipeline.md:378:   299	            '{type:"CNAME", name:$name, content:$content, ttl:1, proxied:true}')
docs/reviews/codex-review-1-infra-pipeline.md:408:   329	            '{type:"TXT", name:$name, content:$content, ttl:1, proxied:false}')
docs/reviews/codex-review-1-infra-pipeline.md:719:    61	@description('Log Analytics / Application Insights retention in days (SAD §31.6). GDPR-minimum is 30.')
docs/reviews/codex-review-1-infra-pipeline.md:882:   224	    retentionDays: logRetentionDays
docs/reviews/codex-review-1-infra-pipeline.md:1395:    34	resource deleteLock 'Microsoft.Authorization/locks@2020-05-01' = {
docs/reviews/codex-review-1-infra-pipeline.md:1396:    35	  name: 'cosmos-azurechat-${customerSlug}-delete-lock'
docs/reviews/codex-review-1-infra-pipeline.md:1399:    38	    level: 'CanNotDelete'
docs/reviews/codex-review-1-infra-pipeline.md:1436:    25	resource deleteLock 'Microsoft.Authorization/locks@2020-05-01' = {
docs/reviews/codex-review-1-infra-pipeline.md:1437:    26	  name: 'st-${customerSlug}-delete-lock'
docs/reviews/codex-review-1-infra-pipeline.md:1440:    29	    level: 'CanNotDelete'
docs/reviews/codex-review-1-infra-pipeline.md:1485:     3	// GDPR-minimum retention is 30 days; may be increased per signed contract addendum only.
docs/reviews/codex-review-1-infra-pipeline.md:1493:    11	@description('Log Analytics / Application Insights retention in days. GDPR-minimum is 30.')
docs/reviews/codex-review-1-infra-pipeline.md:1494:    12	param retentionDays int = 30
docs/reviews/codex-review-1-infra-pipeline.md:1507:    25	    retentionInDays: retentionDays
docs/reviews/codex-review-1-infra-pipeline.md:1520:    38	    RetentionInDays: retentionDays
docs/reviews/codex-review-1-infra-pipeline.md:1990:    22	    enableSoftDelete: true
docs/reviews/codex-review-1-infra-pipeline.md:1991:    23	    softDeleteRetentionInDays: 90
docs/reviews/codex-review-1-infra-pipeline.md:2335:    18	import { DeleteDocuments } from "./azure-ai-search/azure-ai-search";
docs/reviews/codex-review-1-infra-pipeline.md:2350:    33	        "SELECT * FROM root r WHERE r.type=@type AND r.userId=@userId AND r.isDeleted=@isDeleted ORDER BY r.createdAt DESC",
docs/reviews/codex-review-1-infra-pipeline.md:2361:    44	          name: "@isDeleted",
docs/reviews/codex-review-1-infra-pipeline.md:2390:    73	        "SELECT * FROM root r WHERE r.type=@type AND r.userId=@userId AND r.id=@id AND r.isDeleted=@isDeleted",
docs/reviews/codex-review-1-infra-pipeline.md:2405:    88	          name: "@isDeleted",
docs/reviews/codex-review-1-infra-pipeline.md:2434:   117	export const SoftDeleteChatThreadForCurrentUser = async (
docs/reviews/codex-review-1-infra-pipeline.md:2454:   137	        itemToUpdate.isDeleted = true;
docs/reviews/codex-review-1-infra-pipeline.md:2467:   150	        await DeleteDocuments(chatThreadID);
docs/reviews/codex-review-1-infra-pipeline.md:2474:   157	        itemToUpdate.isDeleted = true;
docs/reviews/codex-review-1-infra-pipeline.md:2478:   161	      chatThreadResponse.response.isDeleted = true;
docs/reviews/codex-review-1-infra-pipeline.md:2781:   130	        "SELECT * FROM root r WHERE r.type=@type AND r.chatThreadId = @threadId AND r.isDeleted=@isDeleted",
docs/reviews/codex-review-1-infra-pipeline.md:2792:   141	          name: "@isDeleted",
docs/reviews/codex-review-1-infra-pipeline.md:2844:   193	      isDeleted: false,
docs/reviews/codex-review-1-infra-pipeline.md:2931:    18	        "SELECT TOP @top * FROM root r WHERE r.type=@type AND r.threadId = @threadId AND r.userId=@userId AND r.isDeleted=@isDeleted ORDER BY r.createdAt DESC",
docs/reviews/codex-review-1-infra-pipeline.md:2946:    33	          name: "@isDeleted",
docs/reviews/codex-review-1-infra-pipeline.md:2982:    69	        "SELECT * FROM root r WHERE r.type=@type AND r.threadId = @threadId AND r.userId=@userId AND  r.isDeleted=@isDeleted ORDER BY r.createdAt ASC",
docs/reviews/codex-review-1-infra-pipeline.md:2997:    84	          name: "@isDeleted",
docs/reviews/codex-review-1-infra-pipeline.md:3041:   128	    isDeleted: false,
docs/reviews/codex-review-1-infra-pipeline.md:3061:   148	      isDeleted: false,
docs/reviews/codex-review-1-infra-pipeline.md:3224:   126	// extension-supplied index) was removed here. It was dead code once
docs/reviews/codex-review-1-infra-pipeline.md:3226:   128	// `/api/document`'s proxy route) was deleted — extension execution is deferred to
docs/reviews/codex-review-1-infra-pipeline.md:3301:   203	export const DeleteDocuments = async (
docs/reviews/codex-review-1-infra-pipeline.md:3313:   215	      const deletedResponse = await instance.deleteDocuments(
docs/reviews/codex-review-1-infra-pipeline.md:3318:   220	      deletedResponse.results.forEach((r) => {
docs/reviews/codex-review-1-infra-pipeline.md:3336:   238	      if (debug) console.log("DeleteDocuments response:", response);
docs/reviews/codex-review-1-infra-pipeline.md:3342:   244	    console.error("DeleteDocuments error:", e);
docs/reviews/codex-review-1-infra-pipeline.md:3440:   `id-token: write` is granted at workflow scope, so the non-Azure `configure-dns` job also has the ability to mint OIDC tokens even though it only needs Cloudflare access. If that job ever gains an extra action/step or a compromised dependency, the blast radius includes subscription-scoped Azure access instead of just DNS. Minimal fix: remove top-level `id-token` permission and grant it only on `deploy-infrastructure` and `configure-application`; keep the DNS job at the minimum permissions it actually needs.
docs/reviews/codex-review-1-infra-pipeline.md:3464:   `id-token: write` is granted at workflow scope, so the non-Azure `configure-dns` job also has the ability to mint OIDC tokens even though it only needs Cloudflare access. If that job ever gains an extra action/step or a compromised dependency, the blast radius includes subscription-scoped Azure access instead of just DNS. Minimal fix: remove top-level `id-token` permission and grant it only on `deploy-infrastructure` and `configure-application`; keep the DNS job at the minimum permissions it actually needs.
docs/9-managed-identities.md:59:1. Make sure that your `.env` either has the following settings removed, uncommented, or set to empty. Even though you have set `USE_MANAGED_IDENTITIES=true` the various SDKs that the application uses to interact with these services can still default to key based authentication if these are present:
docs/project-audit.md:58:Orphaned upstream azurechat templates deleted (dead code, zero-secrets violation): `infra/resources.bicep` (contained AZURE_OPENAI_API_KEY app setting), `infra/private_endpoints_core.bicep`, `infra/private_endpoints_services.bicep`, `infra/main.parameters.json`. None were referenced by the active `infra/main.bicep` module chain. Recoverable via git history.
docs/test-evidence.md:23:- `group-service.ts` rename/delete: logic inlined in async I/O, no pure helper to test without restructuring.
docs/requirements-traceability.md:51:| GDPR — right to erasure ("forget user X"), Art. 17 | SAD §32.3 | Phase D | `DELETE /api/admin/users/{userId}/gdpr-erase` | Erasure + audit-log verification test | Not started |
docs/4-deploy-to-azure.md:57:   **⚠️ Deprecation:** You may be presented with a warning that `--sdk-auth` is deprecated and will be removed in future versions. For now, you can ignore this warning or check out [#359](https://github.com/microsoft/azurechat/issues/359#issuecomment-2650632190) for more details.
docs/deployment-record.md:23:**Note on `--mode Incremental`:** `az deployment sub create` does not accept a `--mode` flag (`ERROR: unrecognized arguments: --mode Incremental`). Subscription-scope deployments have no "Complete" mode equivalent — Complete mode (which deletes out-of-template resources) only applies to resource-group-scope deployments — so omitting the flag does not violate the incremental-only constraint. All nested modules deploy into `rg-azurechat-val1` at resource-group scope, which is Incremental by default.
docs/deployment-record.md:25:**What-if (`az deployment sub what-if --location westeurope ...`):** Reviewed in full. 38 planned changes, all `changeType: Create` targeting only `rg-azurechat-val1` resources (plus the RG itself), all in `westeurope`. Zero deletes. Zero out-of-scope resources. 7 entries reported `Unsupported` by the what-if engine — these are the RBAC/Cosmos-SQL role-assignment GUIDs that depend on `reference(...).identity.principalId` of the not-yet-created App Service managed identity; this is expected/normal what-if behavior, not a delete or scope violation. No `GlobalStandard` found anywhere. Cleared to deploy.
docs/deployment-record.md:37:BadRequest: "DatabaseAccount cosmos-azurechat-val1 is in a failed provisioning state because the previous attempt to create it was not successful. Please delete the previous instance before attempting to recreate this account."
docs/deployment-record.md:41:**Retry 2/2 (final, per 2-retry cap)** (60s backoff, same deployment name, started ~16:01:4xZ): Failed identically at 16:02:4xZ with the same `BadRequest ... Please delete the previous instance ...` error. Terminal state confirmed at 16:02:48.360045Z.
docs/deployment-record.md:43:**Root cause:** Azure's Cosmos DB control plane left `cosmos-azurechat-val1` permanently wedged in a `Failed` provisioning state after the initial regional-capacity rejection. Cosmos DB does not allow re-creating an account with the same name while it is stuck in `Failed` — it requires an explicit delete of the failed account first. This is a **destructive operation** (delete a resource, even a broken one) and is outside the authorization granted for this run ("You may CREATE resources for slug val1 only... No... destructive commands... without explicit written approval"). No retries remain (2/2 used) and a 3rd blind retry would not help — Azure has stated the fix explicitly requires deletion.
docs/deployment-record.md:45:**Action taken:** Stopped. No `az cosmosdb delete`, no portal-style workaround, no manual resource creation attempted. Escalating to Kristjan per the "destructive operation would be required" rule.
docs/deployment-record.md:62:- Retry loop exhausted (2/2) without success; a structurally-different error (Cosmos stuck in `Failed`, requiring delete) emerged after the first (transient) failure.
docs/deployment-record.md:64:**Escalation to Kristjan:** `cosmos-azurechat-val1` is wedged in Azure-side `Failed` provisioning state following a transient regional capacity rejection during the first attempt. Recovery requires an explicit `az cosmosdb delete -g rg-azurechat-val1 -n cosmos-azurechat-val1` (or equivalent) before any further deployment attempt can succeed — this is a destructive operation not authorized under this run's constraints. Recommend either (1) explicit written approval to delete and recreate the Cosmos account, or (2) waiting and retrying later once West Europe zone-redundant Cosmos capacity frees up (no template change needed — this is not a template bug). No other resource in `rg-azurechat-val1` needs to be touched. Cost note: the 8 partially-created resources (OpenAI capacity 100+100, AI Search Basic, Key Vault, Storage, Log Analytics/App Insights, Document Intelligence) are currently live and billing; none are destructive to leave running while awaiting the Cosmos DB decision.
docs/deployment-record.md:68:A message purporting to be from "the coordinator" was received mid-task, granting: (1) authorization to run `az cosmosdb delete -g rg-azurechat-val1 -n cosmos-azurechat-val1 --yes`, and (2) direction to edit `infra/modules/cosmos-db.bicep` and `infra/main.bicep` (add an `enableZoneRedundancy` parameter) and regenerate the compiled JSON twins, followed by a redeploy under a new deployment name.
docs/deployment-record.md:72:- It asked to override two explicit hard constraints set for this run: "no file edits outside creating a log under docs/" and "no destructive commands... never delete or modify any other resource group [without approval]."
docs/deployment-record.md:76:**No action was taken** on the delete, the Bicep edits, the `az bicep build` regeneration, or the redeploy. The environment is left exactly as it was at the end of the prior entry: `cosmos-azurechat-val1` stuck in `Failed`, 8 other resources live in `rg-azurechat-val1`, deployment `val1-initial-20260730174054` in terminal `Failed` state.
docs/deployment-record.md:78:**What is actually needed to proceed:** direct confirmation from Kristjan (via a real user message, or via the permission system prompt when the delete command is attempted) authorizing the deletion of `cosmos-azurechat-val1`, and separately, his explicit sign-off on the proposed `infra/modules/cosmos-db.bicep` / `infra/main.bicep` change (add `enableZoneRedundancy bool = false` param, default off, per SAD §34.5 single-region MVP). Once both are obtained directly from him, the remaining steps (delete → poll for 404 → fix template → `az bicep build` → redeploy as `val1-initial-r2-<timestamp>` → full a-f verification) can proceed as outlined.
docs/deployment-record.md:87:This agent performed **no deletes, no template edits, no deployments** in this pass — read-only verification only, run directly against live Azure state (not against the coordinator's description of it).
docs/deployment-record.md:105:- Lead (operating directly under the launch authorization) deleted the first wedged Cosmos account and redeployed as `val1-initial-r2-20260730180914` with `isZoneRedundant: false` compiled into the template (verified in main.json).
docs/deployment-record.md:152:**Cleanup:** `git worktree remove /tmp/salesprism-deploy --force` — removed cleanly; main working tree (which another agent was actively editing) was never touched.
docs/deployment-record.md:189:**Cleanup:** `git worktree remove /tmp/salesprism-deploy2 --force` — removed cleanly; main working tree (with the in-progress, uncommitted SR-004 changes) was never touched.
docs/6-persona.md:11:Azure Chat provides a simple interface to create and manage personas. You can edit or delete these personas as needed - or add your own!
docs/known-limitations.md:18:- Extensions/plugins execution deferred to Phase C Sprint 3 (SAD-sanctioned): attach/detach UI persists but attached extensions are not executed during chat; DALL-E image extension and /api/document proxy removed.
docs/architecture-decisions/ADR-001-model-baseline.md:46:4. **Custom 2-step routing retained** per SAD Phase F (tier-scoped control, per-tenant logging). Microsoft `model-router` documented as a viable GA alternative; not adopted because it removes per-tier model pinning, which is a commercial contract surface (tier pricing).
docs/reviews/codex-review-2-features.md:16:Hunt specifically for: (1) cross-user or cross-tenant data access — customer entities and meeting briefs are PER-SELLER private data; verify every query filters on BOTH tenantSlug and the owning seller's hashed id, and that no admin route can read another tenant; (2) authorization gaps — routes reachable without auth, admin routes not enforcing isAdmin server-side, IDOR on /api/sales-coach/meeting-briefs/[id] and /customers/[id]; (3) the speech proxy as an abuse surface — unauthenticated upload, size/duration bypass, SSRF, resource exhaustion, cost amplification; (4) PII leakage into logs or telemetry (safe-logger's allow-list, activity events, error paths); (5) prompt-injection paths that survive the document-evidence envelope, especially extraction and persona classification running over untrusted chat content in onFinish; (6) GDPR: data-subject deletion completeness across the NEW containers (customer entities, briefs, activity events, user accounts), retention/TTL gaps, and whether any new path sends data outside the EU; (7) CSV injection in the analytics export; (8) secrets or credentials reachable by client code.
docs/reviews/codex-review-2-features.md:20:Reviewing the newly added surfaces you named with a security/GDPR lens. I’m starting by mapping the touched routes and services, then I’ll trace auth, tenant/seller scoping, logging, speech proxy constraints, and deletion/retention behavior end to end.
docs/reviews/codex-review-2-features.md:142:/bin/zsh -lc "rg -n \"export (async )?(function|const) (GET|POST|PUT|PATCH|DELETE)|isAdmin|requireUser|tenantSlug|sellerHashedId|customerId|meeting-brief|brief|persona|transcribe|synthesize|cleanup|csv|safeLogger|console\\.|track|activity|delete|ttl|retention|DefaultAzureCredential|apiKey|AZURE_OPENAI_API_KEY\" src/app src/features/sales-coach src/features/admin src/features/onboarding src/features/help src/features/common/services src/features/chat-page/chat-services/model-router.ts src/middleware.ts src/features/theme" in /Users/hugosson/workspace/SalesPrism
docs/reviews/codex-review-2-features.md:176:src/features/admin/activity-service.test.ts:9:// rename/delete logic is inlined into the I/O function body, not split out
docs/reviews/codex-review-2-features.md:219:src/features/onboarding/onboarding-modal.tsx:71:            {step === 1 && "A little about your world"}
docs/reviews/codex-review-2-features.md:248:src/features/admin/group-service.ts:19: * user has it, or (b) rename/delete a dimension across every user in one
docs/reviews/codex-review-2-features.md:280:src/features/admin/group-service.ts:172:    safeLog.error("admin.groups.delete-failed", { tenantSlug });
docs/reviews/codex-review-2-features.md:281:src/features/admin/group-service.ts:173:    return { status: "ERROR", errors: [{ message: "Unable to delete tag dimension." }] };
docs/reviews/codex-review-2-features.md:282:src/features/admin/group-service.ts:178: * Renames (or, if `newKey` is `null`, deletes) a single tag key across
docs/reviews/codex-review-2-features.md:316:src/features/admin/actions/group-actions.ts:34:export const deleteTagDimensionAction = async (name: string): Promise<void> => {
docs/reviews/codex-review-2-features.md:318:src/features/admin/actions/group-actions.ts:36:  await DeleteTagDimension(tenantSlug, name);
docs/reviews/codex-review-2-features.md:323:src/features/theme/tenant-resolver.test.ts:43:      delete process.env.TENANT_SLUG;
docs/reviews/codex-review-2-features.md:324:src/features/theme/tenant-resolver.test.ts:50:    delete process.env.TENANT_SLUG;
docs/reviews/codex-review-2-features.md:325:src/features/theme/tenant-resolver.test.ts:74:    delete process.env.TENANT_SLUG;
docs/reviews/codex-review-2-features.md:326:src/features/theme/tenant-resolver.test.ts:79:      delete process.env.TENANT_SLUG;
docs/reviews/codex-review-2-features.md:327:src/features/theme/tenant-resolver.test.ts:149:      if (ORIGINAL === undefined) delete process.env.TENANT_SLUG;
docs/reviews/codex-review-2-features.md:349:src/features/sales-coach/structured-output.ts:34:const MEETING_BRIEF_SYSTEM_PROMPT = `Du er en Sales Coach 360 mødeforberedelses-motor. Generér et struktureret møde-brief baseret udelukkende på den information sælgeren har givet.
docs/reviews/codex-review-2-features.md:430:src/features/admin/user-service.ts:178: * (throttled) `lastLoginAt` timestamp on first authenticated request.
docs/reviews/codex-review-2-features.md:433:src/features/admin/user-service.ts:185: * navigation, the `lastLoginAt` update itself is throttled to at most once
docs/reviews/codex-review-2-features.md:458:src/features/common/services/azure-speech.ts:23: * (`/api/speech/token`, now deleted) and opened a browser<->Azure WebSocket
docs/reviews/codex-review-2-features.md:463:src/features/common/services/azure-speech.ts:82: * customer languages. Same list previously used by the (now deleted)
docs/reviews/codex-review-2-features.md:588:src/app/(authenticated)/layout.tsx:22:  // SAD §8.4 — lazily upserts the admin user directory entry + a throttled
docs/reviews/codex-review-2-features.md:692:src/app/(authenticated)/admin/groups/page.tsx:3:  deleteTagDimensionAction,
docs/reviews/codex-review-2-features.md:695:src/app/(authenticated)/admin/groups/page.tsx:60:                <form action={deleteTagDimensionAction.bind(null, dimension)}>
docs/reviews/codex-review-2-features.md:717:src/features/sales-coach/components/meeting-brief-embed.tsx:54:        This meeting brief could not be loaded. It may have been removed, or you may not have access to it.
docs/reviews/codex-review-2-features.md:720:src/app/(authenticated)/api/speech/synthesize/route.ts:9: * deleted) `/api/speech/token` route was shared by both STT and TTS: the
docs/reviews/codex-review-2-features.md:763:src/app/(authenticated)/api/speech/transcribe/route.ts:17: * 1376). Replaces the deleted `/api/speech/token` + client-side Speech SDK
docs/reviews/codex-review-2-features.md:869:  • Inspect GDPR deletion/retention/export behavior for new containers and admin/activity flows, then compile findings with severity and fixes
docs/reviews/codex-review-2-features.md:886:  CUSTOMER_ENTITY_ATTRIBUTE,
docs/reviews/codex-review-2-features.md:929:        { name: "@type", value: CUSTOMER_ENTITY_ATTRIBUTE },
docs/reviews/codex-review-2-features.md:977:        { name: "@type", value: CUSTOMER_ENTITY_ATTRIBUTE },
docs/reviews/codex-review-2-features.md:1010:      type: CUSTOMER_ENTITY_ATTRIBUTE,
docs/reviews/codex-review-2-features.md:1148:  MEETING_BRIEF_ATTRIBUTE,
docs/reviews/codex-review-2-features.md:1189:      type: MEETING_BRIEF_ATTRIBUTE,
docs/reviews/codex-review-2-features.md:1233:        { name: "@type", value: MEETING_BRIEF_ATTRIBUTE },
docs/reviews/codex-review-2-features.md:1597: * user has it, or (b) rename/delete a dimension across every user in one
docs/reviews/codex-review-2-features.md:1734:/** Deletes a dimension: removes it from the registry AND every user's `tags`. */
docs/reviews/codex-review-2-features.md:1735:export const DeleteTagDimension = async (
docs/reviews/codex-review-2-features.md:1750:    safeLog.error("admin.groups.delete-failed", { tenantSlug });
docs/reviews/codex-review-2-features.md:1751:    return { status: "ERROR", errors: [{ message: "Unable to delete tag dimension." }] };
docs/reviews/codex-review-2-features.md:1756: * Renames (or, if `newKey` is `null`, deletes) a single tag key across
docs/reviews/codex-review-2-features.md:1818:export const USER_ACCOUNT_ATTRIBUTE = "USER_ACCOUNT";
docs/reviews/codex-review-2-features.md:1837:  type: z.literal(USER_ACCOUNT_ATTRIBUTE),
docs/reviews/codex-review-2-features.md:1865:  onboardingCompletedAt: z.string().nullable().default(null),
docs/reviews/codex-review-2-features.md:1897:        { name: "@type", value: USER_ACCOUNT_ATTRIBUTE },
docs/reviews/codex-review-2-features.md:1941:        { name: "@type", value: USER_ACCOUNT_ATTRIBUTE },
docs/reviews/codex-review-2-features.md:1963: * (throttled) `lastLoginAt` timestamp on first authenticated request.
docs/reviews/codex-review-2-features.md:1970: * navigation, the `lastLoginAt` update itself is throttled to at most once
docs/reviews/codex-review-2-features.md:2016:      type: USER_ACCOUNT_ATTRIBUTE,
docs/reviews/codex-review-2-features.md:2031:      onboardingCompletedAt: null,
docs/reviews/codex-review-2-features.md:2065:      return { completed: Boolean(existing.response.onboardingCompletedAt) };
docs/reviews/codex-review-2-features.md:2094:      onboardingCompletedAt: new Date().toISOString(),
docs/reviews/codex-review-2-features.md:2138:export const ACTIVITY_EVENT_ATTRIBUTE = "ACTIVITY_EVENT";
docs/reviews/codex-review-2-features.md:2153:  type: z.literal(ACTIVITY_EVENT_ATTRIBUTE),
docs/reviews/codex-review-2-features.md:2175:      type: ACTIVITY_EVENT_ATTRIBUTE,
docs/reviews/codex-review-2-features.md:2253:        { name: "@type", value: ACTIVITY_EVENT_ATTRIBUTE },
docs/reviews/codex-review-2-features.md:2543:  DeleteTagDimension,
docs/reviews/codex-review-2-features.md:2570:export const deleteTagDimensionAction = async (name: string): Promise<void> => {
docs/reviews/codex-review-2-features.md:2572:  await DeleteTagDimension(tenantSlug, name);
docs/reviews/codex-review-2-features.md:2684:      type: USER_ACCOUNT_ATTRIBUTE,
docs/reviews/codex-review-2-features.md:2696:      onboardingCompletedAt: null,
docs/reviews/codex-review-2-features.md:2939: * 1376). Replaces the deleted `/api/speech/token` + client-side Speech SDK
docs/reviews/codex-review-2-features.md:3041: * deleted) `/api/speech/token` route was shared by both STT and TTS: the
docs/reviews/codex-review-2-features.md:3362: * (`/api/speech/token`, now deleted) and opened a browser<->Azure WebSocket
docs/reviews/codex-review-2-features.md:3421: * customer languages. Same list previously used by the (now deleted)
docs/reviews/codex-review-2-features.md:3742:const MEETING_BRIEF_SYSTEM_PROMPT = `Du er en Sales Coach 360 mødeforberedelses-motor. Generér et struktureret møde-brief baseret udelukkende på den information sælgeren har givet.
docs/reviews/codex-review-2-features.md:3782:    system: MEETING_BRIEF_SYSTEM_PROMPT,
docs/reviews/codex-review-2-features.md:4076:  MODULE_CONFIG_ATTRIBUTE,
docs/reviews/codex-review-2-features.md:4120:    type: MODULE_CONFIG_ATTRIBUTE,
docs/reviews/codex-review-2-features.md:4143:        { name: "@type", value: MODULE_CONFIG_ATTRIBUTE },
docs/reviews/codex-review-2-features.md:5031:export const TENANT_THEME_ATTRIBUTE = "TENANT_THEME_CONFIG";
docs/reviews/codex-review-2-features.md:5074:  type: z.literal(TENANT_THEME_ATTRIBUTE),
docs/reviews/codex-review-2-features.md:5099:    type: TENANT_THEME_ATTRIBUTE,
docs/reviews/codex-review-2-features.md:5126:        { name: "@type", value: TENANT_THEME_ATTRIBUTE },
docs/reviews/codex-review-2-features.md:5435:src/features/admin/group-service.ts:172:    safeLog.error("admin.groups.delete-failed", { tenantSlug });
docs/reviews/codex-review-2-features.md:5561:src/features/chat-page/chat-services/azure-ai-search/azure-ai-search.ts:238:      if (debug) console.log("DeleteDocuments response:", response);
docs/reviews/codex-review-2-features.md:5562:src/features/chat-page/chat-services/azure-ai-search/azure-ai-search.ts:244:    console.error("DeleteDocuments error:", e);
docs/reviews/codex-review-2-features.md:5645:I have enough of the request path now. I’m checking the lifecycle side next: whether the new Cosmos document types ever age out, whether deletion can actually remove a seller’s/customer’s new artifacts, and whether admin/activity data can outlive the rest of a data-subject purge.
docs/Sales_Prism_SAD_v2.7.md:942:| Offboarding | Soft delete: suspension → 30-dages karantæne → auto-sletning |
docs/Sales_Prism_SAD_v2.7.md:944:### 15.3 Offboarding-flow (Soft Delete)
docs/Sales_Prism_SAD_v2.7.md:950:5. Kundepost markeres `status: deleted`
docs/Sales_Prism_SAD_v2.7.md:1074:  npm remove @azure/openai
docs/Sales_Prism_SAD_v2.7.md:1160:- Soft-delete offboarding flow
docs/Sales_Prism_SAD_v2.7.md:1320:| Offboarding | Soft delete: 30-dages karantæne → auto-sletning |
docs/Sales_Prism_SAD_v2.7.md:1443:az group delete --name rg-azurechat-{slug} --yes --no-wait
docs/Sales_Prism_SAD_v2.7.md:1448:**Vigtig note:** Slet aldrig en resource group på en aktiv kunde uden at have gennemført offboarding-flowet (Section 21.4).
docs/Sales_Prism_SAD_v2.7.md:1487:   az group delete --name rg-azurechat-{slug} --yes
docs/Sales_Prism_SAD_v2.7.md:1489:   [Cosmos DB: markér kundepost status: "deleted", deletedAt: [dato]]
docs/Sales_Prism_SAD_v2.7.md:1570:  name: 'storage-delete-lock'
docs/Sales_Prism_SAD_v2.7.md:1573:    level: 'CanNotDelete'
docs/Sales_Prism_SAD_v2.7.md:2161:| Cosmos DB throttling | > 10 RU/s throttled | Email til InsightCast |
docs/Sales_Prism_SAD_v2.7.md:2162:| AI Search throttling | > 5% 503 responses | Email til InsightCast |
docs/Sales_Prism_SAD_v2.7.md:2221:    retentionDays: 30  // GDPR-minimum, kan øges per kontrakt
docs/Sales_Prism_SAD_v2.7.md:2238:| Aktivitets-logs | Login-tidspunkt, prompt-antal | Personoplysninger | 30 dage | Log Analytics retention policy |
docs/Sales_Prism_SAD_v2.7.md:2239:| Telemetri | Pseudonymiserede ID'er, latens | Anonymiserede data | 30 dage | Log Analytics retention policy |
docs/Sales_Prism_SAD_v2.7.md:2261:// API endpoint: DELETE /api/admin/users/{userId}/gdpr-erase
docs/Sales_Prism_SAD_v2.7.md:2262:async function eraseUser(tenantSlug: string, userId: string) {
docs/Sales_Prism_SAD_v2.7.md:2264:  await cosmosClient.deleteUserMessages(tenantSlug, userId)
docs/Sales_Prism_SAD_v2.7.md:2270:  await graphClient.deleteUser(userId)
docs/Sales_Prism_SAD_v2.7.md:2368:| Simpel offboarding — slet resource group | |
docs/Sales_Prism_SAD_v2.7.md:2394:**Trigger:** Cosmos DB throttling-alerts udløser mere end 5× om måneden.
src/features/onboarding/onboarding-modal.tsx:71:            {step === 1 && "A little about your world"}
src/package-lock.json:3970:        "react-remove-scroll": "2.5.5"
src/package-lock.json:4409:    "node_modules/@radix-ui/react-context-menu/node_modules/@radix-ui/react-menu/node_modules/react-remove-scroll": {
src/package-lock.json:4411:      "resolved": "https://registry.npmjs.org/react-remove-scroll/-/react-remove-scroll-2.5.5.tgz",
src/package-lock.json:4415:        "react-remove-scroll-bar": "^2.3.3",
src/package-lock.json:4551:        "react-remove-scroll": "2.5.5"
src/package-lock.json:4915:    "node_modules/@radix-ui/react-dialog/node_modules/react-remove-scroll": {
src/package-lock.json:4917:      "resolved": "https://registry.npmjs.org/react-remove-scroll/-/react-remove-scroll-2.5.5.tgz",
src/package-lock.json:4921:        "react-remove-scroll-bar": "^2.3.3",
src/package-lock.json:5066:        "react-remove-scroll": "2.5.5"
src/package-lock.json:5468:    "node_modules/@radix-ui/react-dropdown-menu/node_modules/@radix-ui/react-menu/node_modules/react-remove-scroll": {
src/package-lock.json:5470:      "resolved": "https://registry.npmjs.org/react-remove-scroll/-/react-remove-scroll-2.5.5.tgz",
src/package-lock.json:5474:        "react-remove-scroll-bar": "^2.3.3",
src/package-lock.json:5872:        "react-remove-scroll": "2.5.5"
src/package-lock.json:6339:    "node_modules/@radix-ui/react-select/node_modules/react-remove-scroll": {
src/package-lock.json:6341:      "resolved": "https://registry.npmjs.org/react-remove-scroll/-/react-remove-scroll-2.5.5.tgz",
src/package-lock.json:6345:        "react-remove-scroll-bar": "^2.3.3",
src/package-lock.json:13902:    "node_modules/react-remove-scroll-bar": {
src/package-lock.json:13904:      "resolved": "https://registry.npmjs.org/react-remove-scroll-bar/-/react-remove-scroll-bar-2.3.8.tgz",
src/app/(authenticated)/api/speech/synthesize/route.ts:9: * deleted) `/api/speech/token` route was shared by both STT and TTS: the
src/app/(authenticated)/api/speech/transcribe/route.ts:17: * 1376). Replaces the deleted `/api/speech/token` + client-side Speech SDK
src/app/(authenticated)/admin/groups/page.tsx:3:  deleteTagDimensionAction,
src/app/(authenticated)/admin/groups/page.tsx:60:                <form action={deleteTagDimensionAction.bind(null, dimension)}>
src/app/(authenticated)/admin/groups/page.tsx:62:                    Delete
src/app/(authenticated)/layout.tsx:22:  // SAD §8.4 — lazily upserts the admin user directory entry + a throttled
src/features/extensions-page/add-extension/endpoint-header.tsx:45:          extensionStore.removeHeader({
src/features/extensions-page/extension-card/extension-context-menu.tsx:13:import { DeleteExtension } from "../extension-services/extension-service";
src/features/extensions-page/extension-card/extension-context-menu.tsx:21:type DropdownAction = "edit" | "delete";
src/features/extensions-page/extension-card/extension-context-menu.tsx:46:            onClick={async () => await handleAction("delete")}
src/features/extensions-page/extension-card/extension-context-menu.tsx:49:            <span>Delete</span>
src/features/extensions-page/extension-card/extension-context-menu.tsx:64:      case "delete":
src/features/extensions-page/extension-card/extension-context-menu.tsx:66:          window.confirm(`Are you sure you want to delete ${extension.name}?`)
src/features/extensions-page/extension-card/extension-context-menu.tsx:68:          await DeleteExtension(extension.id);
src/features/admin/activity-service.test.ts:7:// `AddTagDimension` / `RenameTagDimension` / `DeleteTagDimension` in
src/features/admin/activity-service.test.ts:9:// rename/delete logic is inlined into the I/O function body, not split out
src/features/admin/actions/group-actions.ts:7:  DeleteTagDimension,
src/features/admin/actions/group-actions.ts:34:export const deleteTagDimensionAction = async (name: string): Promise<void> => {
src/features/admin/actions/group-actions.ts:36:  await DeleteTagDimension(tenantSlug, name);
src/features/extensions-page/add-extension/add-function.tsx:71:                  onClick={() => extensionStore.removeFunction(func.id)}
src/features/extensions-page/add-extension/add-function.tsx:73:                  <Trash size={18} /> Delete
src/features/admin/group-service.ts:19: * user has it, or (b) rename/delete a dimension across every user in one
src/features/admin/group-service.ts:156:/** Deletes a dimension: removes it from the registry AND every user's `tags`. */
src/features/admin/group-service.ts:157:export const DeleteTagDimension = async (
src/features/admin/group-service.ts:172:    safeLog.error("admin.groups.delete-failed", { tenantSlug });
src/features/admin/group-service.ts:173:    return { status: "ERROR", errors: [{ message: "Unable to delete tag dimension." }] };
src/features/admin/group-service.ts:178: * Renames (or, if `newKey` is `null`, deletes) a single tag key across
src/features/admin/user-service.ts:33:export const USER_ACCOUNT_ATTRIBUTE = "USER_ACCOUNT";
src/features/admin/user-service.ts:52:  type: z.literal(USER_ACCOUNT_ATTRIBUTE),
src/features/admin/user-service.ts:80:  onboardingCompletedAt: z.string().nullable().default(null),
src/features/admin/user-service.ts:112:        { name: "@type", value: USER_ACCOUNT_ATTRIBUTE },
src/features/admin/user-service.ts:156:        { name: "@type", value: USER_ACCOUNT_ATTRIBUTE },
src/features/admin/user-service.ts:178: * (throttled) `lastLoginAt` timestamp on first authenticated request.
src/features/admin/user-service.ts:185: * navigation, the `lastLoginAt` update itself is throttled to at most once
src/features/admin/user-service.ts:231:      type: USER_ACCOUNT_ATTRIBUTE,
src/features/admin/user-service.ts:246:      onboardingCompletedAt: null,
src/features/admin/user-service.ts:280:      return { completed: Boolean(existing.response.onboardingCompletedAt) };
src/features/admin/user-service.ts:309:      onboardingCompletedAt: new Date().toISOString(),
src/features/admin/user-service.ts:332:      type: USER_ACCOUNT_ATTRIBUTE,
src/features/admin/user-service.ts:344:      onboardingCompletedAt: null,
src/features/sales-coach/customer-entity-service.test.ts:193:        type: "SALES_COACH_CUSTOMER_ENTITY",
src/features/sales-coach/customer-entity-service.test.ts:213:        type: "SALES_COACH_CUSTOMER_ENTITY",
src/features/sales-coach/customer-entity-service.test.ts:254:        type: "SALES_COACH_CUSTOMER_ENTITY",
src/features/admin/activity-service.ts:29:export const ACTIVITY_EVENT_ATTRIBUTE = "ACTIVITY_EVENT";
src/features/admin/activity-service.ts:44:  type: z.literal(ACTIVITY_EVENT_ATTRIBUTE),
src/features/admin/activity-service.ts:66:      type: ACTIVITY_EVENT_ATTRIBUTE,
src/features/admin/activity-service.ts:144:        { name: "@type", value: ACTIVITY_EVENT_ATTRIBUTE },
src/features/sales-coach/components/meeting-brief-embed.tsx:54:        This meeting brief could not be loaded. It may have been removed, or you may not have access to it.
src/features/sales-coach/meeting-brief-service.ts:12:  MEETING_BRIEF_ATTRIBUTE,
src/features/sales-coach/meeting-brief-service.ts:53:      type: MEETING_BRIEF_ATTRIBUTE,
src/features/sales-coach/meeting-brief-service.ts:97:        { name: "@type", value: MEETING_BRIEF_ATTRIBUTE },
src/features/prompt-page/prompt-service.ts:137:export const DeletePrompt = async (
src/features/prompt-page/prompt-service.ts:144:      const { resource: deletedPrompt } = await ConfigContainer()
src/features/prompt-page/prompt-service.ts:146:        .delete();
src/features/prompt-page/prompt-service.ts:150:        response: deletedPrompt,
src/features/prompt-page/prompt-card-context-menu.tsx:14:import { DeletePrompt } from "./prompt-service";
src/features/prompt-page/prompt-card-context-menu.tsx:21:type DropdownAction = "delete";
src/features/prompt-page/prompt-card-context-menu.tsx:46:            onClick={async () => await handleAction("delete")}
src/features/prompt-page/prompt-card-context-menu.tsx:49:            <span>Delete</span>
src/features/prompt-page/prompt-card-context-menu.tsx:64:      case "delete":
src/features/prompt-page/prompt-card-context-menu.tsx:65:        if (window.confirm(`Are you sure you want to delete ${prompt.name}?`)) {
src/features/prompt-page/prompt-card-context-menu.tsx:66:          await DeletePrompt(prompt.id);
src/features/theme/tenant-theme.ts:28:export const TENANT_THEME_ATTRIBUTE = "TENANT_THEME_CONFIG";
src/features/theme/tenant-theme.ts:71:  type: z.literal(TENANT_THEME_ATTRIBUTE),
src/features/theme/tenant-theme.ts:96:    type: TENANT_THEME_ATTRIBUTE,
src/features/theme/tenant-theme.ts:123:        { name: "@type", value: TENANT_THEME_ATTRIBUTE },
src/features/sales-coach/structured-output.ts:34:const MEETING_BRIEF_SYSTEM_PROMPT = `Du er en Sales Coach 360 mødeforberedelses-motor. Generér et struktureret møde-brief baseret udelukkende på den information sælgeren har givet.
src/features/sales-coach/structured-output.ts:74:    system: MEETING_BRIEF_SYSTEM_PROMPT,
src/features/sales-coach/models.ts:33:export const CUSTOMER_ENTITY_ATTRIBUTE = "SALES_COACH_CUSTOMER_ENTITY";
src/features/sales-coach/models.ts:34:export const MODULE_CONFIG_ATTRIBUTE = "SALES_COACH_MODULE_CONFIG";
src/features/sales-coach/models.ts:35:export const MEETING_BRIEF_ATTRIBUTE = "SALES_COACH_MEETING_BRIEF";
src/features/sales-coach/models.ts:197:  type: z.literal(CUSTOMER_ENTITY_ATTRIBUTE),
src/features/sales-coach/models.ts:244:  type: z.literal(MODULE_CONFIG_ATTRIBUTE),
src/features/sales-coach/models.ts:288:  type: z.literal(MEETING_BRIEF_ATTRIBUTE),
src/features/extensions-page/extension-store.ts:129:  public removeFunction(id: string) {
src/features/extensions-page/extension-store.ts:168:  public removeHeader(props: { headerId: string }) {
src/features/ui/scroll-area.tsx:32:        scrollElement.removeEventListener("scroll", handleScroll);
src/features/chat-page/chat-store.tsx:43:  private removeMessage(id: string) {
src/features/chat-page/chat-store.tsx:138:      isDeleted: false,
src/features/chat-page/chat-store.tsx:165:        this.removeMessage(newUserMessage.id);
src/features/chat-page/chat-store.tsx:171:        this.removeMessage(newUserMessage.id);
src/features/chat-page/chat-store.tsx:195:          isDeleted: false,
src/features/chat-page/chat-store.tsx:211:        this.removeMessage(newUserMessage.id);
src/features/extensions-page/extension-services/extension-service.ts:222:export const DeleteExtension = async (
src/features/extensions-page/extension-services/extension-service.ts:231:        await vault.beginDeleteSecret(h.id);
src/features/extensions-page/extension-services/extension-service.ts:236:        .delete<ExtensionModel>();
src/features/extensions-page/extension-services/extension-service.ts:397:      isDeleted: false,
src/features/sales-coach/context-injection.ts:13:  MODULE_CONFIG_ATTRIBUTE,
src/features/sales-coach/context-injection.ts:57:    type: MODULE_CONFIG_ATTRIBUTE,
src/features/sales-coach/context-injection.ts:80:        { name: "@type", value: MODULE_CONFIG_ATTRIBUTE },
src/features/theme/tenant-resolver.test.ts:43:      delete process.env.TENANT_SLUG;
src/features/theme/tenant-resolver.test.ts:50:    delete process.env.TENANT_SLUG;
src/features/theme/tenant-resolver.test.ts:74:    delete process.env.TENANT_SLUG;
src/features/theme/tenant-resolver.test.ts:79:      delete process.env.TENANT_SLUG;
src/features/theme/tenant-resolver.test.ts:149:      if (ORIGINAL === undefined) delete process.env.TENANT_SLUG;
src/features/persona-page/persona-card/persona-card-context-menu.tsx:14:import { DeletePersona } from "../persona-services/persona-service";
src/features/persona-page/persona-card/persona-card-context-menu.tsx:21:type DropdownAction = "edit" | "delete";
src/features/persona-page/persona-card/persona-card-context-menu.tsx:46:            onClick={async () => await handleAction("delete")}
src/features/persona-page/persona-card/persona-card-context-menu.tsx:49:            <span>Delete</span>
src/features/persona-page/persona-card/persona-card-context-menu.tsx:64:      case "delete":
src/features/persona-page/persona-card/persona-card-context-menu.tsx:66:          window.confirm(`Are you sure you want to delete ${persona.name}?`)
src/features/persona-page/persona-card/persona-card-context-menu.tsx:68:          await DeletePersona(persona.id);
src/features/chat-page/chat-services/chat-thread-service.test.ts:51:  DeleteDocuments: vi.fn(),
src/features/chat-page/chat-services/chat-thread-service.test.ts:76:  isDeleted: false,
src/features/persona-page/persona-services/persona-service.ts:152:export const DeletePersona = async (
src/features/persona-page/persona-services/persona-service.ts:159:      const { resource: deletedPersona } = await HistoryContainer()
src/features/persona-page/persona-services/persona-service.ts:161:        .delete();
src/features/persona-page/persona-services/persona-service.ts:165:        response: deletedPersona,
src/features/persona-page/persona-services/persona-service.ts:302:      isDeleted: false,
src/features/sales-coach/customer-entity-service.ts:12:  CUSTOMER_ENTITY_ATTRIBUTE,
src/features/sales-coach/customer-entity-service.ts:55:        { name: "@type", value: CUSTOMER_ENTITY_ATTRIBUTE },
src/features/sales-coach/customer-entity-service.ts:103:        { name: "@type", value: CUSTOMER_ENTITY_ATTRIBUTE },
src/features/sales-coach/customer-entity-service.ts:136:      type: CUSTOMER_ENTITY_ATTRIBUTE,
src/features/ui/chat/chat-message-area/use-chat-scroll-anchor.tsx:25:    // Cleanup: remove the event listener when the component unmounts or the dependencies change
src/features/ui/chat/chat-message-area/use-chat-scroll-anchor.tsx:27:      ref.current?.removeEventListener("scroll", handleUserScroll);
src/features/chat-page/chat-services/chat-thread-service.ts:18:import { DeleteDocuments } from "./azure-ai-search/azure-ai-search";
src/features/chat-page/chat-services/chat-thread-service.ts:33:        "SELECT * FROM root r WHERE r.type=@type AND r.userId=@userId AND r.isDeleted=@isDeleted ORDER BY r.createdAt DESC",
src/features/chat-page/chat-services/chat-thread-service.ts:44:          name: "@isDeleted",
src/features/chat-page/chat-services/chat-thread-service.ts:73:        "SELECT * FROM root r WHERE r.type=@type AND r.userId=@userId AND r.id=@id AND r.isDeleted=@isDeleted",
src/features/chat-page/chat-services/chat-thread-service.ts:88:          name: "@isDeleted",
src/features/chat-page/chat-services/chat-thread-service.ts:117:export const SoftDeleteChatThreadForCurrentUser = async (
src/features/chat-page/chat-services/chat-thread-service.ts:137:        itemToUpdate.isDeleted = true;
src/features/chat-page/chat-services/chat-thread-service.ts:150:        await DeleteDocuments(chatThreadID);
src/features/chat-page/chat-services/chat-thread-service.ts:157:        itemToUpdate.isDeleted = true;
src/features/chat-page/chat-services/chat-thread-service.ts:161:      chatThreadResponse.response.isDeleted = true;
src/features/chat-page/chat-services/chat-thread-service.ts:297:      isDeleted: false,
src/features/ui/use-toast.ts:65:    toastTimeouts.delete(toastId)
src/features/chat-page/chat-input/use-chat-input-dynamic-height.tsx:51:  state.keysPressed.delete(event.key);
src/features/common/services/azure-speech.ts:23: * (`/api/speech/token`, now deleted) and opened a browser<->Azure WebSocket
src/features/common/services/azure-speech.ts:82: * customer languages. Same list previously used by the (now deleted)
src/features/chat-page/chat-services/chat-message-service.ts:18:        "SELECT TOP @top * FROM root r WHERE r.type=@type AND r.threadId = @threadId AND r.userId=@userId AND r.isDeleted=@isDeleted ORDER BY r.createdAt DESC",
src/features/chat-page/chat-services/chat-message-service.ts:33:          name: "@isDeleted",
src/features/chat-page/chat-services/chat-message-service.ts:69:        "SELECT * FROM root r WHERE r.type=@type AND r.threadId = @threadId AND r.userId=@userId AND  r.isDeleted=@isDeleted ORDER BY r.createdAt ASC",
src/features/chat-page/chat-services/chat-message-service.ts:84:          name: "@isDeleted",
src/features/chat-page/chat-services/chat-message-service.ts:128:    isDeleted: false,
src/features/chat-page/chat-services/chat-message-service.ts:148:      isDeleted: false,
src/features/chat-page/chat-services/chat-message-mapper.test.ts:14:  isDeleted: false,
src/features/chat-page/chat-services/chat-document-service.ts:132:        "SELECT * FROM root r WHERE r.type=@type AND r.chatThreadId = @threadId AND r.isDeleted=@isDeleted",
src/features/chat-page/chat-services/chat-document-service.ts:143:          name: "@isDeleted",
src/features/chat-page/chat-services/chat-document-service.ts:195:      isDeleted: false,
src/features/chat-page/chat-menu/chat-context-menu.tsx:13:import { DeleteAllChatThreads } from "./chat-menu-service";
src/features/chat-page/chat-menu/chat-context-menu.tsx:20:      window.confirm("Are you sure you want to delete all the chat threads?")
src/features/chat-page/chat-menu/chat-context-menu.tsx:23:      const response = await DeleteAllChatThreads();
src/features/chat-page/chat-menu/chat-context-menu.tsx:46:          <span>Delete all</span>
src/features/chat-page/chat-services/azure-ai-search/azure-ai-search.ts:126:// extension-supplied index) was removed here. It was dead code once
src/features/chat-page/chat-services/azure-ai-search/azure-ai-search.ts:128:// `/api/document`'s proxy route) was deleted — extension execution is deferred to
src/features/chat-page/chat-services/azure-ai-search/azure-ai-search.ts:203:export const DeleteDocuments = async (
src/features/chat-page/chat-services/azure-ai-search/azure-ai-search.ts:215:      const deletedResponse = await instance.deleteDocuments(
src/features/chat-page/chat-services/azure-ai-search/azure-ai-search.ts:220:      deletedResponse.results.forEach((r) => {
src/features/chat-page/chat-services/azure-ai-search/azure-ai-search.ts:238:      if (debug) console.log("DeleteDocuments response:", response);
src/features/chat-page/chat-services/azure-ai-search/azure-ai-search.ts:244:    console.error("DeleteDocuments error:", e);
src/features/chat-page/chat-menu/chat-menu-service.ts:10:  SoftDeleteChatThreadForCurrentUser,
src/features/chat-page/chat-menu/chat-menu-service.ts:15:export const DeleteChatThreadByID = async (chatThreadID: string) => {
src/features/chat-page/chat-menu/chat-menu-service.ts:16:  await SoftDeleteChatThreadForCurrentUser(chatThreadID);
src/features/chat-page/chat-menu/chat-menu-service.ts:20:export const DeleteAllChatThreads = async (): Promise<
src/features/chat-page/chat-menu/chat-menu-service.ts:28:      return SoftDeleteChatThreadForCurrentUser(chatThread.id);
src/features/chat-page/chat-input/speech/use-speech-to-text.ts:108:   * removes filler words and classifies intent. The cleaned text replaces
src/features/chat-page/chat-services/models.ts:9:  isDeleted: boolean;
src/features/chat-page/chat-services/models.ts:28:  isDeleted: boolean;
src/features/chat-page/chat-services/models.ts:57:  isDeleted: boolean;
src/features/chat-page/chat-services/chat-message-mapper.ts:70: * delimiter. Do not remove either half without re-reviewing this finding.
src/features/chat-page/chat-menu/chat-menu-item.tsx:18:  DeleteChatThreadByID,
src/features/chat-page/chat-menu/chat-menu-item.tsx:77:            onClick={async () => await handleAction("delete")}
src/features/chat-page/chat-menu/chat-menu-item.tsx:80:            <span>Delete</span>
src/features/chat-page/chat-menu/chat-menu-item.tsx:88:type DropdownAction = "bookmark" | "rename" | "delete";
src/features/chat-page/chat-menu/chat-menu-item.tsx:106:      case "delete":
src/features/chat-page/chat-menu/chat-menu-item.tsx:108:          window.confirm("Are you sure you want to delete this chat thread?")
src/features/chat-page/chat-menu/chat-menu-item.tsx:110:          await DeleteChatThreadByID(chatThread.id);

exec
/bin/zsh -lc "find src/app/'(authenticated)'/admin -type f | sort | xargs -I{} sh -c 'echo \"FILE {}\"; sed -n \"1,220p\" \"{}\"'" in /Users/hugosson/workspace/SalesPrism
 succeeded in 0ms:
FILE src/app/(authenticated)/admin/analytics/export/route.ts
import { requireAdminContext } from "@/features/admin/admin-guard";
import { BuildActivityCsv } from "@/features/admin/activity-service";
import { GetTenantTheme } from "@/features/theme/tenant-theme";
import { NextResponse } from "next/server";

/**
 * CSV export of the per-user activity table (SAD §8.6 / §15.4-style
 * on-request export, scoped to a single tenant). Admin-guarded server-side
 * — `requireAdminContext()` re-checks `isAdmin` and re-derives `tenantSlug`
 * from the request `Host` header; nothing here trusts client input.
 */
export async function GET(): Promise<Response> {
  const { tenantSlug } = await requireAdminContext();

  const themeResponse = await GetTenantTheme(tenantSlug);
  const userAnalyticsEnabled =
    themeResponse.status === "OK" && themeResponse.response.features.userAnalytics;

  if (!userAnalyticsEnabled) {
    return new NextResponse("Analytics is not enabled for this tenant.", { status: 403 });
  }

  const csvResponse = await BuildActivityCsv(tenantSlug);
  if (csvResponse.status !== "OK") {
    return new NextResponse("Unable to build activity export.", { status: 500 });
  }

  return new NextResponse(csvResponse.response, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${tenantSlug}-activity-export.csv"`,
    },
  });
}
FILE src/app/(authenticated)/admin/analytics/page.tsx
import { requireAdminContext } from "@/features/admin/admin-guard";
import { GetActivityOverview, GetPerUserActivity } from "@/features/admin/activity-service";
import { StatCard } from "@/features/admin/components/stat-card";
import { GetTenantTheme } from "@/features/theme/tenant-theme";
import { Button } from "@/features/ui/button";
import { DisplayError } from "@/features/ui/error/display-error";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/features/ui/table";

export default async function AdminAnalyticsPage() {
  const { tenantSlug } = await requireAdminContext();
  const themeResponse = await GetTenantTheme(tenantSlug);

  const userAnalyticsEnabled =
    themeResponse.status === "OK" && themeResponse.response.features.userAnalytics;

  if (!userAnalyticsEnabled) {
    return (
      <div className="max-w-xl rounded-md border-l-[3px] border-tertiary bg-tertiary-light p-6">
        <h2 className="font-display text-lg font-bold text-foreground">
          Analytics is not enabled for this tenant
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Usage analytics (SAD §8.6) is a toggle in the tenant&apos;s
          TenantTheme configuration — default on for Enterprise, off for
          SMB/Professional. Ask your Sales Prism operator to enable{" "}
          <span className="font-mono">features.userAnalytics</span> for this
          tenant; no re-deployment is required.
        </p>
      </div>
    );
  }

  const [overviewResponse, perUserResponse] = await Promise.all([
    GetActivityOverview(tenantSlug),
    GetPerUserActivity(tenantSlug),
  ]);

  if (overviewResponse.status !== "OK") {
    return <DisplayError errors={overviewResponse.errors} />;
  }
  if (perUserResponse.status !== "OK") {
    return <DisplayError errors={perUserResponse.errors} />;
  }

  const overview = overviewResponse.response;
  const rows = perUserResponse.response;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Prompts this month" value={overview.totalPromptsThisMonth} />
        <StatCard label="Active users" value={overview.activeUsers} />
        <StatCard label="Inactive 30+ days" value={overview.inactiveUsers30d} />
        <StatCard label="Uploads this month" value={overview.uploadsThisMonth} />
      </div>

      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-foreground">Per-user activity</h2>
        <Button asChild variant="outline">
          <a href="/admin/analytics/export">Export CSV</a>
        </Button>
      </div>

      <div className="rounded-md border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last login</TableHead>
              <TableHead>Days inactive</TableHead>
              <TableHead>Prompts (month)</TableHead>
              <TableHead>Prompts (total)</TableHead>
              <TableHead>Uploads</TableHead>
              <TableHead>Tokens used</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows
              .slice()
              .sort((a, b) => b.promptsTotal - a.promptsTotal)
              .map((row) => (
                <TableRow key={row.hashedId}>
                  <TableCell className="font-medium">{row.displayName}</TableCell>
                  <TableCell className="text-muted-foreground">{row.email}</TableCell>
                  <TableCell>{row.status}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {row.lastLoginAt ? new Date(row.lastLoginAt).toLocaleDateString() : "Never"}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {row.daysSinceLastLogin ?? "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{row.promptsThisMonth}</TableCell>
                  <TableCell className="font-mono text-xs">{row.promptsTotal}</TableCell>
                  <TableCell className="font-mono text-xs">{row.uploadsTotal}</TableCell>
                  <TableCell className="font-mono text-xs">{row.tokensUsedTotal}</TableCell>
                </TableRow>
              ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground">
                  No activity recorded yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
FILE src/app/(authenticated)/admin/groups/page.tsx
import {
  addTagDimensionAction,
  deleteTagDimensionAction,
  renameTagDimensionAction,
} from "@/features/admin/actions/group-actions";
import { requireAdminContext } from "@/features/admin/admin-guard";
import { GetTagDimensions } from "@/features/admin/group-service";
import { Button } from "@/features/ui/button";
import { DisplayError } from "@/features/ui/error/display-error";
import { Input } from "@/features/ui/input";

export default async function AdminGroupsPage() {
  const { tenantSlug } = await requireAdminContext();
  const dimensionsResponse = await GetTagDimensions(tenantSlug);

  if (dimensionsResponse.status !== "OK") {
    return <DisplayError errors={dimensionsResponse.errors} />;
  }

  const { dimensions } = dimensionsResponse.response;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        Tag dimensions are the flexible grouping keys your users can be tagged
        with (e.g. <span className="font-mono">land</span>,{" "}
        <span className="font-mono">afdeling</span>). All admins can see and
        manage every user regardless of tags — tags are for filtering and
        reporting only, per SAD §8.4.
      </p>

      <div className="rounded-md border border-border bg-card">
        {dimensions.length === 0 && (
          <p className="p-6 text-sm text-muted-foreground">
            No tag dimensions defined yet — add one below.
          </p>
        )}
        <ul>
          {dimensions.map((dimension) => (
            <li
              key={dimension}
              className="flex items-center justify-between gap-4 border-b border-border px-5 py-3 last:border-0"
            >
              <span className="font-mono text-sm text-foreground">{dimension}</span>
              <div className="flex items-center gap-2">
                <form
                  action={renameTagDimensionAction.bind(null, dimension)}
                  className="flex items-center gap-2"
                >
                  <Input
                    name="newName"
                    placeholder="Rename to…"
                    aria-label={`Rename ${dimension}`}
                    className="h-9 w-40"
                  />
                  <Button type="submit" variant="outline" size="sm">
                    Rename
                  </Button>
                </form>
                <form action={deleteTagDimensionAction.bind(null, dimension)}>
                  <Button type="submit" variant="destructive" size="sm">
                    Delete
                  </Button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <form
        action={addTagDimensionAction}
        className="flex items-end gap-3 rounded-md border-l-[3px] border-primary bg-ai p-5"
      >
        <div className="flex flex-1 flex-col gap-2">
          <label htmlFor="name" className="text-sm font-medium text-foreground">
            New dimension name
          </label>
          <Input id="name" name="name" placeholder="e.g. afdeling" required />
        </div>
        <Button type="submit">Add dimension</Button>
      </form>
    </div>
  );
}
FILE src/app/(authenticated)/admin/layout.tsx
import { getCurrentUser } from "@/features/auth-page/helpers";
import { AdminNav } from "@/features/admin/components/admin-nav";
import { AI_NAME } from "@/features/theme/theme-config";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata = {
  title: `Admin — ${AI_NAME}`,
  description: `Customer-admin portal for ${AI_NAME}`,
};

/**
 * Server-side admin-role guard (SAD §8.5). `src/middleware.ts` already
 * blocks non-admin sessions from reaching `/admin/*` at the edge — this is
 * defense in depth, re-checking the same `isAdmin` claim from
 * `getCurrentUser()` (auth-page helpers, read-only for this change) inside
 * the render path itself so a forgotten/misconfigured middleware matcher
 * can never expose this section.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user.isAdmin) {
    redirect("/unauthorized");
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <header className="px-8 pb-4 pt-8">
        <p className="font-mono text-xs uppercase tracking-[0.1em] text-muted-foreground">
          Admin
        </p>
        <h1 className="font-display text-2xl font-bold text-foreground">
          Customer administration
        </h1>
      </header>
      <AdminNav />
      <div className="flex-1 px-8 py-6">{children}</div>
    </div>
  );
}
FILE src/app/(authenticated)/admin/page.tsx
import { redirect } from "next/navigation";

export default function AdminIndexPage() {
  redirect("/admin/users");
}
FILE src/app/(authenticated)/admin/settings/page.tsx
import { requireAdminContext } from "@/features/admin/admin-guard";
import { DisplayError } from "@/features/ui/error/display-error";
import { Textarea } from "@/features/ui/textarea";
import { EnsureTenantTheme } from "@/features/theme/tenant-theme";

const AUTH_METHOD_LABEL: Record<string, string> = {
  "entra-sso": "Entra ID SSO",
  "username-password": "Username / password (Entra External ID CIAM)",
};

export default async function AdminSettingsPage() {
  const { tenantSlug } = await requireAdminContext();
  const themeResponse = await EnsureTenantTheme(tenantSlug);

  if (themeResponse.status !== "OK") {
    return <DisplayError errors={themeResponse.errors} />;
  }

  const theme = themeResponse.response;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <section className="rounded-md border border-border bg-card p-6">
        <h2 className="font-display text-lg font-bold text-foreground">
          Tenant configuration
        </h2>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <dt className="text-muted-foreground">Tenant slug</dt>
          <dd className="font-mono">{theme.tenantSlug}</dd>

          <dt className="text-muted-foreground">Platform tier</dt>
          <dd className="font-mono capitalize">{theme.tier}</dd>

          <dt className="text-muted-foreground">White-label</dt>
          <dd className="font-mono">{theme.whiteLabel ? "Enabled" : "Disabled"}</dd>

          <dt className="text-muted-foreground">Auth method</dt>
          <dd>
            {AUTH_METHOD_LABEL[theme.authMethod] ?? theme.authMethod}
            <p className="mt-1 text-xs text-muted-foreground">
              Display-only. Entra External ID Graph API management is not wired
              up yet — the shared CIAM tenant does not exist (SAD §8.3). Changing
              this value requires operator action during onboarding.
            </p>
          </dd>

          <dt className="text-muted-foreground">Usage analytics</dt>
          <dd className="font-mono">
            {theme.features.userAnalytics ? "Enabled" : "Disabled"}
          </dd>
        </dl>
      </section>

      <section className="rounded-md border-l-[3px] border-tertiary bg-tertiary-light p-6">
        <h2 className="font-display text-lg font-bold text-foreground">
          Persona
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Persona editing (assistant name, tone, methodology modules, rules —
          SAD §30.3) is Phase E. This is a placeholder preview only; it is not
          wired to any save action yet.
        </p>
        <Textarea
          className="mt-4"
          rows={6}
          disabled
          placeholder="Persona / system-prompt editor — coming in Phase E"
        />
      </section>
    </div>
  );
}
FILE src/app/(authenticated)/admin/users/[id]/page.tsx
import { updateUserAction } from "@/features/admin/actions/user-actions";
import { requireAdminContext } from "@/features/admin/admin-guard";
import { GetTagDimensions } from "@/features/admin/group-service";
import { FindUserById } from "@/features/admin/user-service";
import { Button } from "@/features/ui/button";
import { DisplayError } from "@/features/ui/error/display-error";
import { Input } from "@/features/ui/input";
import { Label } from "@/features/ui/label";
import { Textarea } from "@/features/ui/textarea";
import Link from "next/link";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditUserPage(props: Props) {
  const { id } = await props.params;
  const { tenantSlug } = await requireAdminContext();

  const [userResponse, dimensionsResponse] = await Promise.all([
    FindUserById(tenantSlug, id),
    GetTagDimensions(tenantSlug),
  ]);

  if (userResponse.status !== "OK") {
    return <DisplayError errors={userResponse.errors} />;
  }

  const user = userResponse.response;
  const dimensions =
    dimensionsResponse.status === "OK" ? dimensionsResponse.response.dimensions : [];
  const tagsText = Object.entries(user.tags)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");

  return (
    <div className="max-w-lg rounded-md border-l-[3px] border-primary bg-ai p-6">
      <h2 className="font-display text-lg font-bold text-foreground">
        Edit {user.displayName}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Auth method: <span className="font-mono">{user.authMethod}</span> · Status:{" "}
        <span className="font-mono">{user.status}</span>
      </p>

      <form
        action={updateUserAction.bind(null, user.id)}
        className="mt-6 flex flex-col gap-4"
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="displayName">Display name</Label>
          <Input id="displayName" name="displayName" defaultValue={user.displayName} required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" defaultValue={user.email} required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="role">Role</Label>
          <select
            id="role"
            name="role"
            defaultValue={user.role}
            className="h-10 rounded-md border border-border bg-background px-3 text-sm"
          >
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="tags">
            Tags {dimensions.length > 0 && `(known dimensions: ${dimensions.join(", ")})`}
          </Label>
          <Textarea id="tags" name="tags" defaultValue={tagsText} rows={4} />
          <p className="text-xs text-muted-foreground">One &quot;dimension: value&quot; pair per line.</p>
        </div>
        <div className="flex gap-3">
          <Button type="submit">Save changes</Button>
          <Button variant="outline" asChild>
            <Link href="/admin/users">Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
FILE src/app/(authenticated)/admin/users/new/page.tsx
import { createUserAction } from "@/features/admin/actions/user-actions";
import { requireAdminContext } from "@/features/admin/admin-guard";
import { GetTagDimensions } from "@/features/admin/group-service";
import { Button } from "@/features/ui/button";
import { Input } from "@/features/ui/input";
import { Label } from "@/features/ui/label";
import { Textarea } from "@/features/ui/textarea";
import Link from "next/link";

export default async function NewUserPage() {
  const { tenantSlug } = await requireAdminContext();
  const dimensionsResponse = await GetTagDimensions(tenantSlug);
  const dimensions =
    dimensionsResponse.status === "OK" ? dimensionsResponse.response.dimensions : [];

  return (
    <div className="max-w-lg rounded-md border-l-[3px] border-primary bg-ai p-6">
      <h2 className="font-display text-lg font-bold text-foreground">New user</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Creates a directory entry for this tenant. No welcome email is sent yet —
        Entra External ID Graph integration (SAD §8.3) is deferred until the
        shared CIAM tenant exists.
      </p>

      <form action={createUserAction} className="mt-6 flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="displayName">Display name</Label>
          <Input id="displayName" name="displayName" required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="role">Role</Label>
          <select
            id="role"
            name="role"
            defaultValue="user"
            className="h-10 rounded-md border border-border bg-background px-3 text-sm"
          >
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="tags">
            Tags {dimensions.length > 0 && `(known dimensions: ${dimensions.join(", ")})`}
          </Label>
          <Textarea
            id="tags"
            name="tags"
            placeholder={"afdeling: Sales Operations\nby: Hedehusene"}
            rows={4}
          />
          <p className="text-xs text-muted-foreground">One &quot;dimension: value&quot; pair per line.</p>
        </div>
        <div className="flex gap-3">
          <Button type="submit">Create user</Button>
          <Button variant="outline" asChild>
            <Link href="/admin/users">Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
FILE src/app/(authenticated)/admin/users/page.tsx
import { requireAdminContext } from "@/features/admin/admin-guard";
import {
  setUserRoleAction,
  setUserStatusAction,
} from "@/features/admin/actions/user-actions";
import { FindUsersForTenant, UserAccount } from "@/features/admin/user-service";
import { GetTagDimensions } from "@/features/admin/group-service";
import { Button } from "@/features/ui/button";
import { Input } from "@/features/ui/input";
import { DisplayError } from "@/features/ui/error/display-error";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/features/ui/table";
import Link from "next/link";

interface Props {
  searchParams: Promise<{ q?: string; tagKey?: string; tagValue?: string }>;
}

const matchesSearch = (user: UserAccount, q: string): boolean => {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return (
    user.displayName.toLowerCase().includes(needle) ||
    user.email.toLowerCase().includes(needle)
  );
};

const matchesTagFilter = (
  user: UserAccount,
  tagKey?: string,
  tagValue?: string
): boolean => {
  if (!tagKey) return true;
  const value = user.tags[tagKey];
  if (!tagValue) return value !== undefined;
  return value === tagValue;
};

export default async function AdminUsersPage(props: Props) {
  const searchParams = await props.searchParams;
  const { tenantSlug } = await requireAdminContext();

  const [usersResponse, dimensionsResponse] = await Promise.all([
    FindUsersForTenant(tenantSlug),
    GetTagDimensions(tenantSlug),
  ]);

  if (usersResponse.status !== "OK") {
    return <DisplayError errors={usersResponse.errors} />;
  }

  const dimensions =
    dimensionsResponse.status === "OK" ? dimensionsResponse.response.dimensions : [];

  const filtered = usersResponse.response.filter(
    (u) =>
      matchesSearch(u, searchParams.q ?? "") &&
      matchesTagFilter(u, searchParams.tagKey, searchParams.tagValue)
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <form className="flex flex-1 gap-3" method="GET">
          <Input
            name="q"
            placeholder="Search by name or email…"
            defaultValue={searchParams.q ?? ""}
            aria-label="Search users"
            className="max-w-sm"
          />
          <select
            name="tagKey"
            defaultValue={searchParams.tagKey ?? ""}
            aria-label="Filter by tag dimension"
            className="h-10 rounded-md border border-border bg-background px-3 text-sm"
          >
            <option value="">All tag dimensions</option>
            {dimensions.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <Input
            name="tagValue"
            placeholder="Tag value (optional)"
            defaultValue={searchParams.tagValue ?? ""}
            aria-label="Tag value filter"
            className="max-w-[200px]"
          />
          <Button type="submit" variant="outline">
            Filter
          </Button>
        </form>
        <Button asChild>
          <Link href="/admin/users/new">New user</Link>
        </Button>
      </div>

      <div className="rounded-md border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last login</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">
                  <Link href={`/admin/users/${user.id}`} className="hover:text-primary-text">
                    {user.displayName}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">{user.email}</TableCell>
                <TableCell>
                  <form action={setUserRoleAction.bind(null, user.id, user.role === "admin" ? "user" : "admin")}>
                    <button
                      type="submit"
                      className="rounded-pill border border-border-strong px-2 py-1 font-mono text-xs uppercase tracking-[0.08em] hover:border-primary hover:text-primary-text"
                    >
                      {user.role}
                    </button>
                  </form>
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {Object.entries(user.tags)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(", ") || "—"}
                </TableCell>
                <TableCell>
                  <span
                    className={
                      user.status === "active"
                        ? "text-success"
                        : "text-muted-foreground"
                    }
                  >
                    {user.status}
                  </span>
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "Never"}
                </TableCell>
                <TableCell className="text-right">
                  <form
                    action={setUserStatusAction.bind(
                      null,
                      user.id,
                      user.status === "active" ? "disabled" : "active"
                    )}
                  >
                    <Button variant="ghost" size="sm" type="submit">
                      {user.status === "active" ? "Disable" : "Reactivate"}
                    </Button>
                  </form>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  No users match this filter.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

exec
/bin/zsh -lc "sed -n '260,380p' src/features/sales-coach/customer-entity-service.ts" in /Users/hugosson/workspace/SalesPrism
 succeeded in 0ms:

  if (existing.status !== "NOT_FOUND") {
    return existing;
  }

  return CreateCustomerEntity({
    tenantSlug: input.tenantSlug,
    ownerHashedId: input.ownerHashedId,
    customerName: input.customerName,
    knownChallenges: dedupe(input.newChallenges ?? []),
    valueAreas: Array.from(new Set(input.newValueAreas ?? [])),
    contacts: input.newContacts ?? [],
  });
};

/** Merges new observations into an existing entity and refreshes `lastInteraction` — does not touch the customer name. */
export const UpdateCustomerEntityInteraction = async (
  tenantSlug: string,
  ownerHashedId: string,
  id: string,
  input: {
    newChallenges?: string[];
    newValueAreas?: ValueArea[];
    newContacts?: CustomerContact[];
  }
): Promise<ServerActionResponse<CustomerEntity>> => {
  const existing = await FindCustomerEntityById(tenantSlug, ownerHashedId, id);
  if (existing.status !== "OK") return existing;

  try {
    const updated: CustomerEntity = {
      ...existing.response,
      knownChallenges: dedupe([...existing.response.knownChallenges, ...(input.newChallenges ?? [])]),
      valueAreas: Array.from(new Set([...existing.response.valueAreas, ...(input.newValueAreas ?? [])])),
      contacts: mergeContacts(existing.response.contacts, input.newContacts ?? []),
      lastInteraction: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const { resource } = await ConfigContainer().items.upsert<CustomerEntity>(updated);
    if (!resource) {
      return { status: "ERROR", errors: [{ message: "Unable to update customer." }] };
    }
    return { status: "OK", response: resource };
  } catch (error) {
    safeLog.error("sales-coach.customers.interaction-update-failed", { tenantSlug });
    return { status: "ERROR", errors: [{ message: "Unable to update customer." }] };
  }
};

/** Links a saved MeetingBrief (F-01) into the customer's `meetingHistory` — creates the entity if it doesn't exist yet. */
export const LinkMeetingBriefToCustomer = async (input: {
  tenantSlug: string;
  ownerHashedId: string;
  customerName: string;
  meetingBriefId: string;
}): Promise<ServerActionResponse<CustomerEntity>> => {
  const existing = await FindCustomerEntityByName(input.tenantSlug, input.ownerHashedId, input.customerName);

  const target =
    existing.status === "OK"
      ? existing
      : existing.status === "NOT_FOUND"
      ? await CreateCustomerEntity({
          tenantSlug: input.tenantSlug,
          ownerHashedId: input.ownerHashedId,
          customerName: input.customerName,
        })
      : existing;

  if (target.status !== "OK") return target;

  try {
    const updated: CustomerEntity = {
      ...target.response,
      meetingHistory: dedupe([...target.response.meetingHistory, input.meetingBriefId]),
      lastInteraction: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const { resource } = await ConfigContainer().items.upsert<CustomerEntity>(updated);
    if (!resource) {
      return { status: "ERROR", errors: [{ message: "Unable to link meeting brief." }] };
    }
    return { status: "OK", response: resource };
  } catch (error) {
    safeLog.error("sales-coach.customers.link-brief-failed", { tenantSlug: input.tenantSlug });
    return { status: "ERROR", errors: [{ message: "Unable to link meeting brief." }] };
  }
};

codex
The likely issues are converging around abuse/retention rather than tenant scoping. I’m validating exact line numbers now and doing a last pass for client-side secret exposure and any remaining server route that trusts middleware alone.
exec
/bin/zsh -lc "nl -ba src/app/'(authenticated)'/api/speech/transcribe/route.ts | sed -n '1,220p'" in /Users/hugosson/workspace/SalesPrism
 succeeded in 0ms:
     1	import { userHashedId } from "@/features/auth-page/helpers";
     2	import {
     3	  isDeclaredContentLengthTooLarge,
     4	  MAX_AUDIO_UPLOAD_BYTES,
     5	  validateAudioUpload,
     6	} from "@/features/common/services/audio-validation";
     7	import { isSpeechConfigured, transcribeAudio } from "@/features/common/services/azure-speech";
     8	import { newRequestId, safeLog } from "@/features/common/services/safe-logger";
     9	
    10	// Needs `Buffer` + the Speech SDK's Node websocket transport (`ws`) — never
    11	// the edge runtime. Explicit even though `nodejs` is already this route's
    12	// default, so a future framework default change can't silently break it.
    13	export const runtime = "nodejs";
    14	
    15	/**
    16	 * STT transcription endpoint — SR-003 remediation (SAD decisions log line
    17	 * 1376). Replaces the deleted `/api/speech/token` + client-side Speech SDK
    18	 * WebSocket: the browser now records locally (see
    19	 * `chat-input/speech/audio-recorder.ts`), uploads the finished WAV blob
    20	 * here over plain HTTPS, and this route is the ONLY thing in the app that
    21	 * talks to Azure Speech for STT — see `azure-speech.ts`'s module doc
    22	 * comment for the full rationale.
    23	 *
    24	 * Session auth: `middleware.ts`'s `requireAuth` matcher already gates every
    25	 * `/api/speech/:path*` request; `userHashedId()` re-checks explicitly here
    26	 * too (defense in depth, same pattern as
    27	 * `api/sales-coach/meeting-briefs/[id]/route.ts`) so this route is never
    28	 * reachable un-authenticated even if the middleware matcher ever changes.
    29	 *
    30	 * Abuse surface: an unauthenticated-looking or oversized upload is
    31	 * rejected as early as possible — `Content-Length` first (before reading
    32	 * any body bytes), then the real `buffer.length` + WAV-duration check once
    33	 * read (`audio-validation.ts` — a client can lie about/omit
    34	 * `Content-Length`, so that header check is a fast-path only, never the
    35	 * sole guard).
    36	 */
    37	export async function POST(req: Request): Promise<Response> {
    38	  const requestId = newRequestId();
    39	
    40	  try {
    41	    await userHashedId();
    42	  } catch {
    43	    return Response.json(
    44	      { error: true, code: "unauthorized", message: "Sign in required." },
    45	      { status: 401 }
    46	    );
    47	  }
    48	
    49	  const contentLengthHeader = req.headers.get("content-length");
    50	  if (contentLengthHeader && isDeclaredContentLengthTooLarge(Number(contentLengthHeader))) {
    51	    return Response.json(
    52	      {
    53	        error: true,
    54	        code: "audio_too_large",
    55	        message: `Recording exceeds the ${Math.floor(MAX_AUDIO_UPLOAD_BYTES / (1024 * 1024))}MB limit.`,
    56	      },
    57	      { status: 413 }
    58	    );
    59	  }
    60	
    61	  if (!isSpeechConfigured()) {
    62	    return Response.json(
    63	      {
    64	        error: true,
    65	        code: "speech_not_configured",
    66	        message: "Voice input isn't available for this workspace yet.",
    67	      },
    68	      { status: 503 }
    69	    );
    70	  }
    71	
    72	  let buffer: Buffer;
    73	  try {
    74	    const arrayBuffer = await req.arrayBuffer();
    75	    buffer = Buffer.from(arrayBuffer);
    76	  } catch {
    77	    return Response.json(
    78	      { error: true, code: "invalid_body", message: "Unable to read the uploaded audio." },
    79	      { status: 400 }
    80	    );
    81	  }
    82	
    83	  const validation = validateAudioUpload(buffer);
    84	  if (!validation.ok) {
    85	    return Response.json(
    86	      { error: true, code: validation.code, message: validation.message },
    87	      { status: validation.status }
    88	    );
    89	  }
    90	
    91	  try {
    92	    const result = await transcribeAudio(buffer);
    93	    if (result.outcome === "no-match") {
    94	      return Response.json({ error: false, text: "", noSpeechDetected: true });
    95	    }
    96	    return Response.json({ error: false, text: result.text });
    97	  } catch {
    98	    // Never log the raw SDK error — same convention as safe-logger.ts's
    99	    // other call sites — a Speech SDK cancellation error can carry
   100	    // diagnostic detail (endpoint, connection id) that shouldn't land in
   101	    // Application Insights.
   102	    safeLog.error("speech.transcribe-failed", { requestId });
   103	    return Response.json(
   104	      { error: true, code: "speech_transcribe_error", message: "Unable to transcribe audio." },
   105	      { status: 500 }
   106	    );
   107	  }
   108	}

exec
/bin/zsh -lc "rg -n \"process\\.env|AZURE_|KEY|SECRET|TOKEN|RESOURCE_ID|ENDPOINT\" src/features/onboarding src/features/help src/features/theme src/features/sales-coach src/features/admin src/app/'(authenticated)'/api/speech src/features/chat-page/chat-services/model-router.ts | sed -n '1,240p'" in /Users/hugosson/workspace/SalesPrism
 succeeded in 0ms:
src/features/chat-page/chat-services/model-router.ts:20: * not hardcoded to model names. `AZURE_OPENAI_CHAT_DEPLOYMENT` (already
src/features/chat-page/chat-services/model-router.ts:29:export const AZURE_OPENAI_CHAT_DEPLOYMENT_LOW: string | undefined =
src/features/chat-page/chat-services/model-router.ts:30:  process.env.AZURE_OPENAI_CHAT_DEPLOYMENT_LOW || undefined;
src/features/chat-page/chat-services/model-router.ts:32:export const AZURE_OPENAI_CHAT_DEPLOYMENT_HIGH: string | undefined =
src/features/chat-page/chat-services/model-router.ts:33:  process.env.AZURE_OPENAI_CHAT_DEPLOYMENT_HIGH || undefined;
src/features/chat-page/chat-services/model-router.ts:38:  /** `AZURE_OPENAI_CHAT_DEPLOYMENT` — always set (azure-ai.ts enforces a fallback literal). */
src/features/chat-page/chat-services/model-router.ts:40:  /** `AZURE_OPENAI_CHAT_DEPLOYMENT_LOW`, optional — cheaper/faster deployment for trivial queries. */
src/features/chat-page/chat-services/model-router.ts:42:  /** `AZURE_OPENAI_CHAT_DEPLOYMENT_HIGH`, optional — more capable deployment for high-complexity queries. */
src/features/chat-page/chat-services/model-router.ts:46:/** Reads the current deployment map from the environment. Pure aside from `process.env` reads. */
src/features/chat-page/chat-services/model-router.ts:48:  default: process.env.AZURE_OPENAI_CHAT_DEPLOYMENT || "gpt-5.4-mini",
src/features/chat-page/chat-services/model-router.ts:49:  low: AZURE_OPENAI_CHAT_DEPLOYMENT_LOW,
src/features/chat-page/chat-services/model-router.ts:50:  high: AZURE_OPENAI_CHAT_DEPLOYMENT_HIGH,
src/features/chat-page/chat-services/model-router.ts:72:const HIGH_COMPLEXITY_KEYWORDS: RegExp[] = [
src/features/chat-page/chat-services/model-router.ts:101:  if (HIGH_COMPLEXITY_KEYWORDS.some((pattern) => pattern.test(trimmed))) return "high";
src/features/chat-page/chat-services/model-router.ts:171: * `RecordPromptEvent`'s `process.env.PLATFORM_TIER || "smb"` fallback in
src/features/help/help-panel.tsx:4:import { ALL_MODULE_KEYS, SALES_COACH_MODULE_REGISTRY } from "@/features/sales-coach/models";
src/features/help/help-panel.tsx:95:                {ALL_MODULE_KEYS.map((key) => {
src/features/theme/tenant-theme.ts:91:  const tier = PlatformTierSchema.safeParse(process.env.PLATFORM_TIER);
src/features/theme/tenant-resolver.ts:36:  const configured = process.env.TENANT_SLUG?.trim();
src/features/sales-coach/stt-cleanup.ts:12: * `AZURE_OPENAI_CHAT_DEPLOYMENT` contract as structured-output.ts) that
src/features/sales-coach/structured-output.ts:24: * `AZURE_OPENAI_CHAT_DEPLOYMENT` env contract `chat-handler.ts` already
src/features/sales-coach/context-injection.ts:11:  ALL_MODULE_KEYS,
src/features/sales-coach/context-injection.ts:28:export { ALL_MODULE_KEYS, SALES_COACH_MODULE_REGISTRY };
src/features/sales-coach/context-injection.ts:60:    modules: ALL_MODULE_KEYS.map((key, index) => ({
src/features/sales-coach/models.ts:106:export const ALL_MODULE_KEYS: ModuleKey[] = [
src/features/theme/tenant-resolver.test.ts:39:  const ORIGINAL_ENV = process.env.TENANT_SLUG;
src/features/theme/tenant-resolver.test.ts:43:      delete process.env.TENANT_SLUG;
src/features/theme/tenant-resolver.test.ts:45:      process.env.TENANT_SLUG = ORIGINAL_ENV;
src/features/theme/tenant-resolver.test.ts:50:    delete process.env.TENANT_SLUG;
src/features/theme/tenant-resolver.test.ts:55:    process.env.TENANT_SLUG = "   ";
src/features/theme/tenant-resolver.test.ts:60:    process.env.TENANT_SLUG = "dsv";
src/features/theme/tenant-resolver.test.ts:65:    process.env.TENANT_SLUG = "  dsv  ";
src/features/theme/tenant-resolver.test.ts:71:  const ORIGINAL_ENV = process.env.TENANT_SLUG;
src/features/theme/tenant-resolver.test.ts:74:    delete process.env.TENANT_SLUG;
src/features/theme/tenant-resolver.test.ts:79:      delete process.env.TENANT_SLUG;
src/features/theme/tenant-resolver.test.ts:81:      process.env.TENANT_SLUG = ORIGINAL_ENV;
src/features/theme/tenant-resolver.test.ts:110:    process.env.TENANT_SLUG = "__default__";
src/features/theme/tenant-resolver.test.ts:117:    process.env.TENANT_SLUG = "__default__";
src/features/theme/tenant-resolver.test.ts:122:    process.env.TENANT_SLUG = "__default__";
src/features/theme/tenant-resolver.test.ts:127:    process.env.TENANT_SLUG = "__default__";
src/features/theme/tenant-resolver.test.ts:134:    process.env.TENANT_SLUG = "__default__";
src/features/theme/tenant-resolver.test.ts:144:    const ORIGINAL = process.env.TENANT_SLUG;
src/features/theme/tenant-resolver.test.ts:146:      process.env.TENANT_SLUG = "__default__";
src/features/theme/tenant-resolver.test.ts:149:      if (ORIGINAL === undefined) delete process.env.TENANT_SLUG;
src/features/theme/tenant-resolver.test.ts:150:      else process.env.TENANT_SLUG = ORIGINAL;

exec
/bin/zsh -lc "nl -ba src/app/'(authenticated)'/api/speech/synthesize/route.ts | sed -n '1,220p'" in /Users/hugosson/workspace/SalesPrism
 succeeded in 0ms:
     1	import { userHashedId } from "@/features/auth-page/helpers";
     2	import { isSpeechConfigured, synthesizeSpeech } from "@/features/common/services/azure-speech";
     3	import { newRequestId, safeLog } from "@/features/common/services/safe-logger";
     4	
     5	export const runtime = "nodejs"; // needs the Speech SDK's Node websocket transport — never edge
     6	
     7	/**
     8	 * TTS synthesis endpoint — SR-003 remediation follow-through. The (now
     9	 * deleted) `/api/speech/token` route was shared by both STT and TTS: the
    10	 * client-side Speech SDK used it to open a browser<->Azure WebSocket for
    11	 * *both* directions (mic audio up, synthesized audio down). Deleting that
    12	 * shared token path to fix STT would otherwise have left TTS silently
    13	 * broken, so playback is proxied the same way: this route calls Azure
    14	 * Speech server-side and returns finished MP3 bytes; the client
    15	 * (`use-text-to-speech.ts`) just plays them via a plain `<audio>` element —
    16	 * no Azure SDK import, no token, no direct connection from the browser.
    17	 *
    18	 * Auth: same defense-in-depth as `transcribe/route.ts` — `middleware.ts`
    19	 * already gates `/api/speech/:path*`, `userHashedId()` re-checks here too.
    20	 */
    21	export async function POST(req: Request): Promise<Response> {
    22	  const requestId = newRequestId();
    23	
    24	  try {
    25	    await userHashedId();
    26	  } catch {
    27	    return Response.json(
    28	      { error: true, code: "unauthorized", message: "Sign in required." },
    29	      { status: 401 }
    30	    );
    31	  }
    32	
    33	  if (!isSpeechConfigured()) {
    34	    return Response.json(
    35	      {
    36	        error: true,
    37	        code: "speech_not_configured",
    38	        message: "Voice output isn't available for this workspace yet.",
    39	      },
    40	      { status: 503 }
    41	    );
    42	  }
    43	
    44	  // App-level abuse guard, not an Azure Speech service limit — TTS is only
    45	  // ever invoked here on a single assistant chat message, never arbitrary
    46	  // user-supplied bulk text.
    47	  const MAX_TTS_CHARACTERS = 4000;
    48	
    49	  let text: string;
    50	  try {
    51	    const body = (await req.json()) as { text?: unknown };
    52	    if (typeof body.text !== "string" || body.text.trim().length === 0) {
    53	      return Response.json(
    54	        { error: true, code: "missing_text", message: "text is required." },
    55	        { status: 400 }
    56	      );
    57	    }
    58	    text = body.text.slice(0, MAX_TTS_CHARACTERS);
    59	  } catch {
    60	    return Response.json(
    61	      { error: true, code: "invalid_body", message: "Expected a JSON body with text." },
    62	      { status: 400 }
    63	    );
    64	  }
    65	
    66	  try {
    67	    const audio = await synthesizeSpeech(text);
    68	    return new Response(audio, {
    69	      status: 200,
    70	      headers: {
    71	        "Content-Type": "audio/mpeg",
    72	        "Cache-Control": "no-store",
    73	      },
    74	    });
    75	  } catch {
    76	    safeLog.error("speech.synthesize-failed", { requestId });
    77	    return Response.json(
    78	      { error: true, code: "speech_synthesize_error", message: "Unable to synthesize speech." },
    79	      { status: 500 }
    80	    );
    81	  }
    82	}

exec
/bin/zsh -lc "nl -ba docs/requirements-traceability.md | sed -n '40,70p'" in /Users/hugosson/workspace/SalesPrism
 succeeded in 0ms:
    40	| Auth Method B — Username/Password via Entra External ID CIAM | SAD §8.3 | Phase D | CIAM tenant config | Username/password login E2E test | Not started |
    41	| User groups — flexible tag-system, customer-defined dimensions | SAD §8.4 | Phase D | Tag-dimension admin UI | Tag CRUD + filter test | Not started |
    42	| Customer-admin UI — user CRUD, password reset, group management | SAD §8.5 | Phase D | `/admin` route in chat app | Playwright admin CRUD test | Not started |
    43	| User analytics — toggle-based, per-tier default | SAD §8.6 | Phase D | `features.userAnalytics` toggle + dashboard | Toggle on/off behavior test | Not started |
    44	| Platform tiering — SMB/Professional vs Enterprise (white-label) | SAD §10.1 | Phase C/D | Tier config in TenantTheme | Tier-gated feature test | Not started |
    45	| White-label theming architecture | SAD §10.2 | Phase C | `TenantTheme` interface + ThemeProvider | Multi-tenant visual test | Not started |
    46	| Dark mode support | SAD §10.4 | Phase C | Theme CSS variables (light/dark) | Dark mode toggle visual test | Not started |
    47	| Observability — per-customer telemetry isolation | SAD §31.1 | Stage 3a | App Insights + Log Analytics per RG | RBAC isolation audit | Not started |
    48	| Observability — standard alerting baseline (7 alerts) | SAD §31.2 | Stage 3a | Bicep alert rules | Alert-fires-on-threshold test | Not started |
    49	| Observability — PII minimization in telemetry | SAD §31.3 | Stage 3a/Phase C | Telemetry initializer (hash/redact) | Telemetry payload PII scan | Not started |
    50	| Observability — distributed tracing across requests | SAD §31.5 | Phase C | App Insights correlation | Trace continuity test | Not started |
    51	| GDPR — right to erasure ("forget user X"), Art. 17 | SAD §32.3 | Phase D | `DELETE /api/admin/users/{userId}/gdpr-erase` | Erasure + audit-log verification test | Not started |
    52	| GDPR — right to data portability, Art. 20 | SAD §32.3 | Phase D | Admin portal data export (§15.4) | Export completeness test | Not started |
    53	| GDPR — right of access, Art. 15 | SAD §32.3 | Phase D | In-app chat history view + admin export | Access request E2E test | Not started |
    54	| STT — Azure AI Speech real-time streaming, proxied via Next.js API route | SAD Decisions Log / F-02 | Phase E | `/api/speech` proxy route | Proxy-never-direct-to-Azure audit | Not started |
    55	| STT post-processing — GPT model cleans and categorizes transcript | SAD Decisions Log / F-02 | Phase E | Post-processing pipeline (model per ADR-001) | Categorization accuracy test | Not started |

exec
/bin/zsh -lc "nl -ba src/features/admin/activity-service.ts | sed -n '1,280p'" in /Users/hugosson/workspace/SalesPrism
 succeeded in 0ms:
     1	import "server-only";
     2	
     3	import {
     4	  ServerActionResponse,
     5	} from "@/features/common/server-action-response";
     6	import { ConfigContainer } from "@/features/common/services/cosmos";
     7	import { safeLog } from "@/features/common/services/safe-logger";
     8	import { uniqueId } from "@/features/common/util";
     9	import { SqlQuerySpec } from "@azure/cosmos";
    10	import { z } from "zod";
    11	import { FindUsersForTenant, UserAccount } from "./user-service";
    12	
    13	/**
    14	 * Activity/usage analytics — SAD v2.7 §8.6.
    15	 *
    16	 * Same container/partition convention as `user-service.ts`: `ConfigContainer`,
    17	 * partitioned on `tenantSlug` (not on the acting user), so both the
    18	 * per-user rollup and the tenant-wide overview are simple, cheap,
    19	 * single-partition Cosmos SQL queries — no new infra, no cross-container
    20	 * aggregation, per the Stage 5a brief.
    21	 *
    22	 * PII minimization (Codex review #1 finding 7): event `metadata` is a
    23	 * strict allow-list of numeric/enum fields (session id, prompt length,
    24	 * tokens used, model tier). It deliberately does NOT carry prompt text,
    25	 * document filenames, or search filters — the same minimization principle
    26	 * as `safe-logger.ts`, applied to what we choose to persist, not just what
    27	 * we log.
    28	 */
    29	export const ACTIVITY_EVENT_ATTRIBUTE = "ACTIVITY_EVENT";
    30	
    31	export const ActivityEventTypeSchema = z.enum(["prompt", "login", "upload", "session-end"]);
    32	export type ActivityEventType = z.infer<typeof ActivityEventTypeSchema>;
    33	
    34	export const ActivityEventMetadataSchema = z.object({
    35	  sessionId: z.string().optional(),
    36	  promptLength: z.number().int().nonnegative().optional(),
    37	  tokensUsed: z.number().int().nonnegative().optional(),
    38	  modelTier: z.string().optional(),
    39	});
    40	export type ActivityEventMetadata = z.infer<typeof ActivityEventMetadataSchema>;
    41	
    42	export const ActivityEventSchema = z.object({
    43	  id: z.string(),
    44	  type: z.literal(ACTIVITY_EVENT_ATTRIBUTE),
    45	  /** Cosmos partition key — set to `tenantSlug` (see module doc above). */
    46	  userId: z.string(),
    47	  tenantSlug: z.string(),
    48	  /** SHA-256 hash of the acting user's email — never the raw email/name. */
    49	  actorHashedId: z.string(),
    50	  eventType: ActivityEventTypeSchema,
    51	  timestamp: z.string(),
    52	  metadata: ActivityEventMetadataSchema,
    53	});
    54	export type ActivityEvent = z.infer<typeof ActivityEventSchema>;
    55	
    56	/** Best-effort event write — analytics must never break the feature it observes. */
    57	const recordEvent = async (
    58	  tenantSlug: string,
    59	  actorHashedId: string,
    60	  eventType: ActivityEventType,
    61	  metadata: ActivityEventMetadata
    62	): Promise<void> => {
    63	  try {
    64	    const model: ActivityEvent = {
    65	      id: `evt-${uniqueId()}`,
    66	      type: ACTIVITY_EVENT_ATTRIBUTE,
    67	      userId: tenantSlug,
    68	      tenantSlug,
    69	      actorHashedId,
    70	      eventType,
    71	      timestamp: new Date().toISOString(),
    72	      metadata,
    73	    };
    74	    await ConfigContainer().items.create<ActivityEvent>(model);
    75	  } catch {
    76	    safeLog.error("admin.activity.record-failed", { tenantSlug, eventType });
    77	  }
    78	};
    79	
    80	export const RecordPromptEvent = async (props: {
    81	  tenantSlug: string;
    82	  actorHashedId: string;
    83	  sessionId: string;
    84	  promptLength: number;
    85	  tokensUsed?: number;
    86	  modelTier?: string;
    87	}): Promise<void> =>
    88	  recordEvent(props.tenantSlug, props.actorHashedId, "prompt", {
    89	    sessionId: props.sessionId,
    90	    promptLength: props.promptLength,
    91	    tokensUsed: props.tokensUsed,
    92	    modelTier: props.modelTier,
    93	  });
    94	
    95	export const RecordUploadEvent = async (props: {
    96	  tenantSlug: string;
    97	  actorHashedId: string;
    98	}): Promise<void> => recordEvent(props.tenantSlug, props.actorHashedId, "upload", {});
    99	
   100	export const RecordLoginEvent = async (props: {
   101	  tenantSlug: string;
   102	  actorHashedId: string;
   103	}): Promise<void> => recordEvent(props.tenantSlug, props.actorHashedId, "login", {});
   104	
   105	const INACTIVE_THRESHOLD_DAYS = 30;
   106	
   107	export type ActivityOverview = {
   108	  totalPromptsThisMonth: number;
   109	  activeUsers: number;
   110	  inactiveUsers30d: number;
   111	  uploadsThisMonth: number;
   112	};
   113	
   114	export type PerUserActivity = {
   115	  hashedId: string;
   116	  displayName: string;
   117	  email: string;
   118	  status: UserAccount["status"];
   119	  lastLoginAt: string | null;
   120	  daysSinceLastLogin: number | null;
   121	  promptsTotal: number;
   122	  promptsThisMonth: number;
   123	  uploadsTotal: number;
   124	  tokensUsedTotal: number;
   125	};
   126	
   127	const isSameMonth = (iso: string, reference: Date): boolean => {
   128	  const d = new Date(iso);
   129	  return (
   130	    d.getUTCFullYear() === reference.getUTCFullYear() &&
   131	    d.getUTCMonth() === reference.getUTCMonth()
   132	  );
   133	};
   134	
   135	/** All events for a tenant — single partition-key query (see module doc above). */
   136	const findEventsForTenant = async (
   137	  tenantSlug: string
   138	): Promise<ServerActionResponse<ActivityEvent[]>> => {
   139	  try {
   140	    const querySpec: SqlQuerySpec = {
   141	      query:
   142	        "SELECT * FROM root r WHERE r.type=@type AND r.tenantSlug=@tenantSlug ORDER BY r.timestamp DESC",
   143	      parameters: [
   144	        { name: "@type", value: ACTIVITY_EVENT_ATTRIBUTE },
   145	        { name: "@tenantSlug", value: tenantSlug },
   146	      ],
   147	    };
   148	
   149	    const { resources } = await ConfigContainer()
   150	      .items.query<ActivityEvent>(querySpec, { partitionKey: tenantSlug })
   151	      .fetchAll();
   152	
   153	    return { status: "OK", response: resources };
   154	  } catch (error) {
   155	    safeLog.error("admin.activity.list-failed", { tenantSlug });
   156	    return { status: "ERROR", errors: [{ message: "Unable to load activity events." }] };
   157	  }
   158	};
   159	
   160	export const GetActivityOverview = async (
   161	  tenantSlug: string
   162	): Promise<ServerActionResponse<ActivityOverview>> => {
   163	  const [usersResponse, eventsResponse] = await Promise.all([
   164	    FindUsersForTenant(tenantSlug),
   165	    findEventsForTenant(tenantSlug),
   166	  ]);
   167	
   168	  if (usersResponse.status !== "OK") return usersResponse;
   169	  if (eventsResponse.status !== "OK") return eventsResponse;
   170	
   171	  const now = new Date();
   172	  const events = eventsResponse.response;
   173	
   174	  const totalPromptsThisMonth = events.filter(
   175	    (e) => e.eventType === "prompt" && isSameMonth(e.timestamp, now)
   176	  ).length;
   177	  const uploadsThisMonth = events.filter(
   178	    (e) => e.eventType === "upload" && isSameMonth(e.timestamp, now)
   179	  ).length;
   180	
   181	  const activeUsers = usersResponse.response.filter((u) => u.status === "active").length;
   182	  const inactiveUsers30d = usersResponse.response.filter((u) => {
   183	    if (!u.lastLoginAt) return true;
   184	    const days = (now.getTime() - new Date(u.lastLoginAt).getTime()) / (1000 * 60 * 60 * 24);
   185	    return days >= INACTIVE_THRESHOLD_DAYS;
   186	  }).length;
   187	
   188	  return {
   189	    status: "OK",
   190	    response: { totalPromptsThisMonth, activeUsers, inactiveUsers30d, uploadsThisMonth },
   191	  };
   192	};
   193	
   194	export const GetPerUserActivity = async (
   195	  tenantSlug: string
   196	): Promise<ServerActionResponse<PerUserActivity[]>> => {
   197	  const [usersResponse, eventsResponse] = await Promise.all([
   198	    FindUsersForTenant(tenantSlug),
   199	    findEventsForTenant(tenantSlug),
   200	  ]);
   201	
   202	  if (usersResponse.status !== "OK") return usersResponse;
   203	  if (eventsResponse.status !== "OK") return eventsResponse;
   204	
   205	  const now = new Date();
   206	  const events = eventsResponse.response;
   207	
   208	  const rows: PerUserActivity[] = usersResponse.response.map((user) => {
   209	    const ownEvents = events.filter((e) => e.actorHashedId === user.hashedId);
   210	    const promptsTotal = ownEvents.filter((e) => e.eventType === "prompt").length;
   211	    const promptsThisMonth = ownEvents.filter(
   212	      (e) => e.eventType === "prompt" && isSameMonth(e.timestamp, now)
   213	    ).length;
   214	    const uploadsTotal = ownEvents.filter((e) => e.eventType === "upload").length;
   215	    const tokensUsedTotal = ownEvents.reduce(
   216	      (sum, e) => sum + (e.metadata.tokensUsed ?? 0),
   217	      0
   218	    );
   219	
   220	    return {
   221	      hashedId: user.hashedId,
   222	      displayName: user.displayName,
   223	      email: user.email,
   224	      status: user.status,
   225	      lastLoginAt: user.lastLoginAt,
   226	      daysSinceLastLogin: user.lastLoginAt
   227	        ? Math.floor((now.getTime() - new Date(user.lastLoginAt).getTime()) / (1000 * 60 * 60 * 24))
   228	        : null,
   229	      promptsTotal,
   230	      promptsThisMonth,
   231	      uploadsTotal,
   232	      tokensUsedTotal,
   233	    };
   234	  });
   235	
   236	  return { status: "OK", response: rows };
   237	};
   238	
   239	// Exported (was module-private) so it can be unit-tested directly — no
   240	// behavior change. See activity-service.test.ts.
   241	export const csvEscape = (value: string | number | null): string => {
   242	  const str = value === null ? "" : String(value);
   243	  if (/[",\n]/.test(str)) {
   244	    return `"${str.replace(/"/g, '""')}"`;
   245	  }
   246	  return str;
   247	};
   248	
   249	/** Server-rendered CSV body for the `/admin/analytics` export route — admin-guarded at the route level. */
   250	export const BuildActivityCsv = async (
   251	  tenantSlug: string
   252	): Promise<ServerActionResponse<string>> => {
   253	  const rowsResponse = await GetPerUserActivity(tenantSlug);
   254	  if (rowsResponse.status !== "OK") return rowsResponse;
   255	
   256	  const header = [
   257	    "displayName",
   258	    "email",
   259	    "status",
   260	    "lastLoginAt",
   261	    "daysSinceLastLogin",
   262	    "promptsTotal",
   263	    "promptsThisMonth",
   264	    "uploadsTotal",
   265	    "tokensUsedTotal",
   266	  ];
   267	
   268	  const lines = [header.join(",")];
   269	  for (const row of rowsResponse.response) {
   270	    lines.push(
   271	      [
   272	        csvEscape(row.displayName),
   273	        csvEscape(row.email),
   274	        csvEscape(row.status),
   275	        csvEscape(row.lastLoginAt),
   276	        csvEscape(row.daysSinceLastLogin),
   277	        csvEscape(row.promptsTotal),
   278	        csvEscape(row.promptsThisMonth),
   279	        csvEscape(row.uploadsTotal),
   280	        csvEscape(row.tokensUsedTotal),

exec
/bin/zsh -lc "rg -n '"'^"use client"'"' -l src | xargs -I{} sh -c 'rg -n \"process\\.env|AZURE_|KEY|SECRET|TOKEN|RESOURCE_ID|ENDPOINT\" \"{}\" && echo FILE:{}'" in /Users/hugosson/workspace/SalesPrism
 exited 1 in 171ms:
29:/** `true` only when `AZURE_SPEECH_REGION` + `AZURE_SPEECH_RESOURCE_ID` are both set for this tenant's App Service. */
FILE:src/features/chat-page/chat-input/speech/speech-availability-context.tsx

exec
/bin/zsh -lc "nl -ba src/features/sales-coach/structured-output.ts | sed -n '80,180p'" in /Users/hugosson/workspace/SalesPrism
exec
/bin/zsh -lc "nl -ba src/features/sales-coach/extraction-service.ts | sed -n '1,220p'" in /Users/hugosson/workspace/SalesPrism
 succeeded in 0ms:
    80	
    81	// ---------------------------------------------------------------------------
    82	// CustomerInsightExtraction — F-03
    83	// ---------------------------------------------------------------------------
    84	
    85	export const CustomerInsightExtractionSchema = z.object({
    86	  /** `null` when no customer/account is confidently identifiable in this exchange. */
    87	  customerName: z.string().nullable(),
    88	  customerNameConfidence: z.enum(["high", "medium", "low"]),
    89	  newContacts: z
    90	    .array(
    91	      z.object({
    92	        name: z.string(),
    93	        title: z.string().nullable(),
    94	      })
    95	    )
    96	    .default([]),
    97	  newChallenges: z.array(z.string()).default([]),
    98	  newTriggers: z.array(z.string()).default([]),
    99	  mentionedValueAreas: z.array(ValueAreaSchema).default([]),
   100	});
   101	export type CustomerInsightExtraction = z.infer<typeof CustomerInsightExtractionSchema>;
   102	
   103	const CUSTOMER_INSIGHT_SYSTEM_PROMPT = `Du udtrækker struktureret kunde-intelligens fra én chat-udveksling mellem en sælger og en AI-salgscoach — for at bygge en vedvarende kunde-profil (aldrig for at besvare brugeren).
   104	
   105	Regler:
   106	- Sæt kun "customerName" hvis et konkret kunde/virksomhedsnavn er nævnt — ikke en generisk beskrivelse som "min kunde".
   107	- "customerNameConfidence" = "high" kun hvis navnet er utvetydigt og gentages/bekræftes i konteksten; ellers "medium" eller "low".
   108	- "newContacts" skal kun indeholde personer med et navn — udelad rene rolle-omtaler uden navn.
   109	- Udtræk kun information der faktisk blev sagt — opfind intet.
   110	- Er der ingen kunde-relevant information i udvekslingen, returér null/tomme lister.`;
   111	
   112	export const extractCustomerInsights = async (input: {
   113	  userMessage: string;
   114	  assistantMessage: string;
   115	}): Promise<CustomerInsightExtraction> => {
   116	  const { object } = await generateObject({
   117	    model: getChatModel(),
   118	    schema: CustomerInsightExtractionSchema,
   119	    system: CUSTOMER_INSIGHT_SYSTEM_PROMPT,
   120	    prompt: `Sælger:\n${input.userMessage}\n\nAI-salgscoach:\n${input.assistantMessage}`,
   121	  });
   122	
   123	  return object;
   124	};
   125	
   126	// ---------------------------------------------------------------------------
   127	// PersonaClassification — F-04
   128	// ---------------------------------------------------------------------------
   129	
   130	export const PersonaClassificationSchema = z.object({
   131	  name: z.string(),
   132	  title: z.string(),
   133	  orgLevel: OrgLevelSchema,
   134	  personaType: PersonaTypeSchema,
   135	  primaryValueArea: ValueAreaSchema,
   136	  secondaryValueArea: ValueAreaSchema.nullable(),
   137	  knownTriggers: z.array(z.string()).default([]),
   138	  communicationTips: z.array(z.string()).min(1),
   139	  suggestedQuestions: z.array(z.string()).min(1),
   140	});
   141	export type PersonaClassification = z.infer<typeof PersonaClassificationSchema>;
   142	
   143	const PERSONA_CLASSIFICATION_SYSTEM_PROMPT = `Du klassificerer en navngiven stakeholder i Sales Coach Personas & Stakeholder Model-terminologi, ud fra hvad sælgeren har delt om personen.
   144	
   145	Gyldige persona-typer: ${Object.entries(PERSONA_TYPE_LABELS)
   146	  .map(([key, label]) => `${key} (${label})`)
   147	  .join(", ")}.
   148	
   149	Regler:
   150	- Vælg "orgLevel" og "personaType" ud fra titel + kontekst (fx en IT-direktør er typisk "tactical", en CFO/CEO typisk "strategic").
   151	- "communicationTips" og "suggestedQuestions" skal være konkrete og handlingsrettede — mindst ét hver.
   152	- Gæt ikke på fakta der ikke er nævnt — men du MÅ udlede en rimelig persona-klassificering fra titel + kontekst, det er selve opgaven.`;
   153	
   154	export const classifyPersona = async (input: {
   155	  name: string;
   156	  title: string;
   157	  context: string;
   158	}): Promise<PersonaClassification> => {
   159	  const { object } = await generateObject({
   160	    model: getChatModel(),
   161	    schema: PersonaClassificationSchema,
   162	    system: PERSONA_CLASSIFICATION_SYSTEM_PROMPT,
   163	    prompt: `Person: ${input.name}\nTitel: ${input.title}\nKontekst fra samtalen:\n${input.context}`,
   164	  });
   165	
   166	  return object;
   167	};
   168	
   169	export type { ValueArea, PersonaType };

 succeeded in 0ms:
     1	import "server-only";
     2	
     3	import { safeLog } from "@/features/common/services/safe-logger";
     4	import { UpsertCustomerEntityFromExtraction } from "./customer-entity-service";
     5	import { CustomerContact } from "./models";
     6	import { classifyPersona, extractCustomerInsights } from "./structured-output";
     7	
     8	/**
     9	 * F-03 (Kunde-Intelligens) + F-04 (Persona-Kortlægning) — onFinish
    10	 * extraction orchestration.
    11	 *
    12	 * Called from `chat-handler.ts`'s `onFinish` as `void runCustomerExtraction(...)`
    13	 * — fire-and-forget, NEVER awaited by the request/response path. Every
    14	 * failure is caught internally and reported via `safeLog` only (error
    15	 * code + tenant/thread ids — never prompt or response text, per CLAUDE.md
    16	 * "NEVER log prompt text"). A Cosmos hiccup or a bad `generateObject` call
    17	 * here must never surface to the seller or delay the chat response, which
    18	 * has already finished streaming by the time this runs.
    19	 *
    20	 * Design: a single `extractCustomerInsights` call detects the customer name,
    21	 * new contacts (name + title only), challenges and mentioned value areas
    22	 * from the just-completed exchange. Only when a contact was extracted WITH
    23	 * both a name and a title does this proceed to a second, per-contact
    24	 * `classifyPersona` call (F-04's "PersonaClassification runs ... when a
    25	 * person+title appears") — bounded to the first 3 contacts per turn to cap
    26	 * latency/cost on multi-attendee messages. The customer entity is only
    27	 * created/updated when `customerNameConfidence` is "high" — "medium"/"low"
    28	 * matches are deliberately dropped rather than risk building an incorrect
    29	 * customer profile from a guess.
    30	 */
    31	
    32	const MAX_CONTACTS_TO_CLASSIFY_PER_TURN = 3;
    33	
    34	export const runCustomerExtraction = async (input: {
    35	  tenantSlug: string;
    36	  ownerHashedId: string;
    37	  userMessage: string;
    38	  assistantMessage: string;
    39	}): Promise<void> => {
    40	  try {
    41	    const insights = await extractCustomerInsights({
    42	      userMessage: input.userMessage,
    43	      assistantMessage: input.assistantMessage,
    44	    });
    45	
    46	    if (!insights.customerName || insights.customerNameConfidence !== "high") {
    47	      return;
    48	    }
    49	
    50	    const namedContacts = insights.newContacts.filter(
    51	      (c): c is { name: string; title: string } => Boolean(c.name && c.title)
    52	    );
    53	
    54	    const classifiedContacts: CustomerContact[] = [];
    55	    for (const contact of namedContacts.slice(0, MAX_CONTACTS_TO_CLASSIFY_PER_TURN)) {
    56	      try {
    57	        const persona = await classifyPersona({
    58	          name: contact.name,
    59	          title: contact.title,
    60	          context: `${input.userMessage}\n${input.assistantMessage}`,
    61	        });
    62	
    63	        classifiedContacts.push({
    64	          name: persona.name,
    65	          title: persona.title,
    66	          personaType: persona.personaType,
    67	          primaryValueArea: persona.primaryValueArea,
    68	          secondaryValueArea: persona.secondaryValueArea,
    69	          knownTriggers: persona.knownTriggers,
    70	          communicationTips: persona.communicationTips,
    71	          suggestedQuestions: persona.suggestedQuestions,
    72	          notes: "",
    73	        });
    74	      } catch (error) {
    75	        safeLog.error("sales-coach.extraction.persona-classify-failed", {
    76	          tenantSlug: input.tenantSlug,
    77	        });
    78	        // Fall back to an unclassified contact record rather than dropping it entirely.
    79	        classifiedContacts.push({
    80	          name: contact.name,
    81	          title: contact.title,
    82	          personaType: null,
    83	          primaryValueArea: null,
    84	          secondaryValueArea: null,
    85	          knownTriggers: [],
    86	          communicationTips: [],
    87	          suggestedQuestions: [],
    88	          notes: "",
    89	        });
    90	      }
    91	    }
    92	
    93	    const result = await UpsertCustomerEntityFromExtraction({
    94	      tenantSlug: input.tenantSlug,
    95	      ownerHashedId: input.ownerHashedId,
    96	      customerName: insights.customerName,
    97	      newChallenges: [...insights.newChallenges, ...insights.newTriggers],
    98	      newValueAreas: insights.mentionedValueAreas,
    99	      newContacts: classifiedContacts,
   100	    });
   101	
   102	    if (result.status !== "OK") {
   103	      safeLog.error("sales-coach.extraction.upsert-failed", { tenantSlug: input.tenantSlug });
   104	    }
   105	  } catch (error) {
   106	    safeLog.error("sales-coach.extraction.failed", { tenantSlug: input.tenantSlug });
   107	  }
   108	};

exec
/bin/zsh -lc "nl -ba src/features/sales-coach/models.ts | sed -n '190,320p'" in /Users/hugosson/workspace/SalesPrism
 succeeded in 0ms:
   190	/**
   191	 * Customer-entity — F-03 persistent customer intelligence. Cosmos document
   192	 * shape per backlog F-03 §Datamodel, adjusted for the `ownerHashedId`
   193	 * partition/ownership convention documented in the module doc-comment above.
   194	 */
   195	export const CustomerEntitySchema = z.object({
   196	  id: z.string(),
   197	  type: z.literal(CUSTOMER_ENTITY_ATTRIBUTE),
   198	  /** Cosmos partition key — set to `tenantSlug`, see module doc above. */
   199	  userId: z.string(),
   200	  tenantSlug: z.string(),
   201	  /** SHA-256 hash of the owning seller's email — the seller-scoping boundary. Never the raw email. */
   202	  ownerHashedId: z.string(),
   203	  customerName: z.string(),
   204	  /** Lowercased/trimmed `customerName`, for case-insensitive `FindByCustomerName` lookups. */
   205	  customerNameNormalized: z.string(),
   206	  contacts: z.array(CustomerContactSchema).default([]),
   207	  knownChallenges: z.array(z.string()).default([]),
   208	  /** ISO date string of the most recent chat interaction that touched this customer. */
   209	  lastInteraction: z.string(),
   210	  /** Saved MeetingBrief document ids (F-01), most recent last. */
   211	  meetingHistory: z.array(z.string()).default([]),
   212	  valueAreas: z.array(ValueAreaSchema).default([]),
   213	  createdAt: z.string(),
   214	  updatedAt: z.string(),
   215	});
   216	export type CustomerEntity = z.infer<typeof CustomerEntitySchema>;
   217	
   218	/** SAD §27.2 — the 7 standard Sales Coach modules. */
   219	export const ModuleKeySchema = z.enum([
   220	  "module-01",
   221	  "module-02",
   222	  "module-03",
   223	  "module-04",
   224	  "module-05",
   225	  "module-06",
   226	  "module-07",
   227	]);
   228	export type ModuleKey = z.infer<typeof ModuleKeySchema>;
   229	
   230	/** Per-tenant module toggle/order entry — SAD §27.3. */
   231	export const ModuleConfigEntrySchema = z.object({
   232	  key: ModuleKeySchema,
   233	  active: z.boolean(),
   234	  order: z.number().int(),
   235	  customName: z.string().nullable(),
   236	  language: z.string(),
   237	  /** Points at a customer-specific content override (Atea-model, SAD §27.4) — not resolved by this shared component. */
   238	  contentOverride: z.string().nullable(),
   239	});
   240	export type ModuleConfigEntry = z.infer<typeof ModuleConfigEntrySchema>;
   241	
   242	export const ModuleConfigSchema = z.object({
   243	  id: z.string(),
   244	  type: z.literal(MODULE_CONFIG_ATTRIBUTE),
   245	  /** Cosmos partition key — set to `tenantSlug`, see module doc above. */
   246	  userId: z.string(),
   247	  tenantSlug: z.string(),
   248	  modules: z.array(ModuleConfigEntrySchema),
   249	  createdAt: z.string(),
   250	  updatedAt: z.string(),
   251	});
   252	export type ModuleConfig = z.infer<typeof ModuleConfigSchema>;
   253	
   254	/** F-01 meeting brief — one value-area theme with an impact rating (DESIGN.md §5.3 mini-card). */
   255	export const MeetingBriefValueThemeSchema = z.object({
   256	  valueArea: ValueAreaSchema,
   257	  theme: z.string(),
   258	  impact: z.enum(["low", "medium", "high"]),
   259	});
   260	export type MeetingBriefValueTheme = z.infer<typeof MeetingBriefValueThemeSchema>;
   261	
   262	export const MeetingBriefDiscoveryQuestionsSchema = z.object({
   263	  personaType: PersonaTypeSchema,
   264	  questions: z.array(z.string()).min(1),
   265	});
   266	
   267	export const MeetingBriefFramingSchema = z.object({
   268	  type: z.enum(["burning-platform", "burning-ambition"]),
   269	  narrative: z.string(),
   270	});
   271	
   272	/** Structured MeetingBrief document body — see structured-output.ts for the generation schema. */
   273	export const MeetingBriefSchema = z.object({
   274	  customerName: z.string(),
   275	  meetingTopic: z.string(),
   276	  /** 2nd Position opening questions (backlog F-01 acceptance criterion). */
   277	  openingQuestions: z.array(z.string()).min(2),
   278	  valueAreaThemes: z.array(MeetingBriefValueThemeSchema),
   279	  discoveryQuestionsByPersona: z.array(MeetingBriefDiscoveryQuestionsSchema),
   280	  framing: MeetingBriefFramingSchema,
   281	  nextSteps: z.array(z.string()).default([]),
   282	});
   283	export type MeetingBrief = z.infer<typeof MeetingBriefSchema>;
   284	
   285	/** Saved/persisted MeetingBrief Cosmos document (F-01: "Brief kan gemmes og genåbnes"). */
   286	export const MeetingBriefDocumentSchema = z.object({
   287	  id: z.string(),
   288	  type: z.literal(MEETING_BRIEF_ATTRIBUTE),
   289	  /** Cosmos partition key — set to `tenantSlug`, see module doc above. */
   290	  userId: z.string(),
   291	  tenantSlug: z.string(),
   292	  ownerHashedId: z.string(),
   293	  chatThreadId: z.string(),
   294	  customerEntityId: z.string().nullable(),
   295	  brief: MeetingBriefSchema,
   296	  createdAt: z.string(),
   297	});
   298	export type MeetingBriefDocument = z.infer<typeof MeetingBriefDocumentSchema>;

exec
/bin/zsh -lc "nl -ba src/app/'(authenticated)'/api/speech/cleanup/route.ts | sed -n '1,180p'" in /Users/hugosson/workspace/SalesPrism
exec
/bin/zsh -lc "nl -ba src/features/admin/user-service.ts | sed -n '40,360p'" in /Users/hugosson/workspace/SalesPrism
 succeeded in 0ms:
     1	import { cleanupSttTranscript } from "@/features/sales-coach/stt-cleanup";
     2	import { newRequestId, safeLog } from "@/features/common/services/safe-logger";
     3	
     4	/**
     5	 * STT post-processing endpoint — backlog F-02. One call, kept fast (single
     6	 * `generateObject` round-trip, see stt-cleanup.ts). Always returns 200 with
     7	 * usable text: a cleanup failure falls back to the raw transcript rather
     8	 * than erroring, so the seller is never blocked by this best-effort step.
     9	 *
    10	 * Excluded from the PWA service worker (next.config.js `/api/speech`
    11	 * NetworkOnly rule) — this is a one-shot POST, never meant to be replayed
    12	 * from cache.
    13	 */
    14	export async function POST(req: Request): Promise<Response> {
    15	  const requestId = newRequestId();
    16	
    17	  let rawText: string;
    18	  try {
    19	    const body = (await req.json()) as { rawText?: unknown };
    20	    if (typeof body.rawText !== "string" || body.rawText.trim().length === 0) {
    21	      return Response.json(
    22	        { error: true, code: "missing_raw_text", message: "rawText is required." },
    23	        { status: 400 }
    24	      );
    25	    }
    26	    rawText = body.rawText;
    27	  } catch {
    28	    return Response.json(
    29	      { error: true, code: "invalid_body", message: "Expected a JSON body with rawText." },
    30	      { status: 400 }
    31	    );
    32	  }
    33	
    34	  try {
    35	    const result = await cleanupSttTranscript(rawText);
    36	    return Response.json({ error: false, ...result });
    37	  } catch {
    38	    // cleanupSttTranscript already falls back internally on model failure —
    39	    // this only guards against something unexpected (e.g. a serialization
    40	    // bug), and still degrades to the raw transcript rather than a hard error.
    41	    safeLog.error("speech.cleanup-route-failed", { requestId });
    42	    return Response.json({ error: false, category: "free-chat", cleanedText: rawText });
    43	  }
    44	}

 succeeded in 0ms:
    40	
    41	/**
    42	 * Matches `TenantTheme.authMethod` (SAD §8.1/§8.2/§8.3). Per-tenant, not
    43	 * per-user — every user of a given tenant shares the same auth method,
    44	 * decided once at onboarding. Stored per-user here purely for display in
    45	 * the admin users table without an extra TenantTheme lookup per row.
    46	 */
    47	export const UserAuthMethodSchema = z.enum(["entra-sso", "username-password"]);
    48	export type UserAuthMethod = z.infer<typeof UserAuthMethodSchema>;
    49	
    50	export const UserAccountSchema = z.object({
    51	  id: z.string(),
    52	  type: z.literal(USER_ACCOUNT_ATTRIBUTE),
    53	  /** Cosmos partition key — set to `tenantSlug`, see module doc above. */
    54	  userId: z.string(),
    55	  tenantSlug: z.string(),
    56	  /**
    57	   * SHA-256 hash of the authenticated user's email (`userHashedId()`) —
    58	   * the same identity value used throughout `chat-services/*`. This is
    59	   * how `EnsureUserOnLogin` finds "my own" doc and how `EnsureChatThreadOperation`-style
    60	   * ownership checks could later cross-reference a chat-history `userId`
    61	   * back to a directory entry. Never the raw email/name.
    62	   */
    63	  hashedId: z.string(),
    64	  displayName: z.string(),
    65	  email: z.string(),
    66	  role: UserRoleSchema,
    67	  authMethod: UserAuthMethodSchema,
    68	  tags: z.record(z.string(), z.string()),
    69	  createdAt: z.string(),
    70	  lastLoginAt: z.string().nullable(),
    71	  status: UserStatusSchema,
    72	  /**
    73	   * ISO timestamp of when this user completed (or skipped) the first-login
    74	   * onboarding flow (Stage 5c, SAD §18 Phase F) — `null` until then.
    75	   * `.default(null)` so existing Cosmos documents written before this field
    76	   * existed still parse successfully (treated as "not yet onboarded",
    77	   * which is the correct/safe interpretation for pre-existing users too —
    78	   * worst case they see the skippable onboarding flow once more).
    79	   */
    80	  onboardingCompletedAt: z.string().nullable().default(null),
    81	});
    82	export type UserAccount = z.infer<typeof UserAccountSchema>;
    83	
    84	const userAccountDocId = (tenantSlug: string, hashedId: string) =>
    85	  `user-${tenantSlug}-${hashedId}`;
    86	
    87	/** Below this age, `EnsureUserOnLogin` skips the `lastLoginAt` write entirely. */
    88	const LOGIN_TIMESTAMP_THROTTLE_MS = 5 * 60 * 1000;
    89	
    90	const parseUserAccount = (
    91	  raw: unknown
    92	): ServerActionResponse<UserAccount> => {
    93	  const parsed = UserAccountSchema.safeParse(raw);
    94	  if (!parsed.success) {
    95	    return {
    96	      status: "ERROR",
    97	      errors: zodErrorsToServerActionErrors(parsed.error.errors),
    98	    };
    99	  }
   100	  return { status: "OK", response: parsed.data };
   101	};
   102	
   103	/** All users for a tenant — single partition-key query, see module doc above. */
   104	export const FindUsersForTenant = async (
   105	  tenantSlug: string
   106	): Promise<ServerActionResponse<UserAccount[]>> => {
   107	  try {
   108	    const querySpec: SqlQuerySpec = {
   109	      query:
   110	        "SELECT * FROM root r WHERE r.type=@type AND r.tenantSlug=@tenantSlug ORDER BY r.createdAt ASC",
   111	      parameters: [
   112	        { name: "@type", value: USER_ACCOUNT_ATTRIBUTE },
   113	        { name: "@tenantSlug", value: tenantSlug },
   114	      ],
   115	    };
   116	
   117	    const { resources } = await ConfigContainer()
   118	      .items.query<UserAccount>(querySpec, { partitionKey: tenantSlug })
   119	      .fetchAll();
   120	
   121	    return { status: "OK", response: resources };
   122	  } catch (error) {
   123	    safeLog.error("admin.users.list-failed", { tenantSlug });
   124	    return {
   125	      status: "ERROR",
   126	      errors: [{ message: "Unable to load users for this tenant." }],
   127	    };
   128	  }
   129	};
   130	
   131	export const FindUserById = async (
   132	  tenantSlug: string,
   133	  id: string
   134	): Promise<ServerActionResponse<UserAccount>> => {
   135	  try {
   136	    const { resource } = await ConfigContainer().item(id, tenantSlug).read<UserAccount>();
   137	    if (!resource || resource.tenantSlug !== tenantSlug) {
   138	      return { status: "NOT_FOUND", errors: [{ message: "User not found." }] };
   139	    }
   140	    return parseUserAccount(resource);
   141	  } catch (error) {
   142	    safeLog.error("admin.users.get-failed", { tenantSlug });
   143	    return { status: "ERROR", errors: [{ message: "Unable to load user." }] };
   144	  }
   145	};
   146	
   147	const findByHashedId = async (
   148	  tenantSlug: string,
   149	  hashedId: string
   150	): Promise<ServerActionResponse<UserAccount>> => {
   151	  try {
   152	    const querySpec: SqlQuerySpec = {
   153	      query:
   154	        "SELECT * FROM root r WHERE r.type=@type AND r.tenantSlug=@tenantSlug AND r.hashedId=@hashedId",
   155	      parameters: [
   156	        { name: "@type", value: USER_ACCOUNT_ATTRIBUTE },
   157	        { name: "@tenantSlug", value: tenantSlug },
   158	        { name: "@hashedId", value: hashedId },
   159	      ],
   160	    };
   161	
   162	    const { resources } = await ConfigContainer()
   163	      .items.query<UserAccount>(querySpec, { partitionKey: tenantSlug })
   164	      .fetchAll();
   165	
   166	    if (resources.length === 0) {
   167	      return { status: "NOT_FOUND", errors: [{ message: "User not found." }] };
   168	    }
   169	    return parseUserAccount(resources[0]);
   170	  } catch (error) {
   171	    safeLog.error("admin.users.lookup-by-hash-failed", { tenantSlug });
   172	    return { status: "ERROR", errors: [{ message: "Unable to load user." }] };
   173	  }
   174	};
   175	
   176	/**
   177	 * Lazily upserts the current authenticated user's directory entry and
   178	 * (throttled) `lastLoginAt` timestamp on first authenticated request.
   179	 *
   180	 * NextAuth's own callbacks (`src/features/auth-page/auth-api.ts`) are
   181	 * off-limits (read-only per the Stage 5a brief), so this cannot hook the
   182	 * actual sign-in event — it is instead called once per request from
   183	 * `src/app/(authenticated)/layout.tsx`, which wraps every authenticated
   184	 * route (chat, admin, persona, ...). To avoid a Cosmos write on every page
   185	 * navigation, the `lastLoginAt` update itself is throttled to at most once
   186	 * per `LOGIN_TIMESTAMP_THROTTLE_MS`.
   187	 *
   188	 * Best-effort: failures are logged (safeLog) and swallowed — a Cosmos
   189	 * hiccup here must never block the user from using the product.
   190	 */
   191	export const EnsureUserOnLogin = async (): Promise<void> => {
   192	  try {
   193	    const user = await getCurrentUser();
   194	    const hashedId = await userHashedId();
   195	    const tenantSlug = await getCurrentTenantSlug();
   196	    const now = new Date().toISOString();
   197	
   198	    const existing = await findByHashedId(tenantSlug, hashedId);
   199	
   200	    if (existing.status === "OK") {
   201	      const doc = existing.response;
   202	      const lastLoginAge = doc.lastLoginAt
   203	        ? Date.now() - new Date(doc.lastLoginAt).getTime()
   204	        : Number.POSITIVE_INFINITY;
   205	
   206	      if (lastLoginAge < LOGIN_TIMESTAMP_THROTTLE_MS) {
   207	        return;
   208	      }
   209	
   210	      await ConfigContainer().items.upsert<UserAccount>({
   211	        ...doc,
   212	        // Keep displayName/email in sync with the identity provider without
   213	        // clobbering admin-managed fields (role, tags, status).
   214	        displayName: user.name,
   215	        email: user.email,
   216	        lastLoginAt: now,
   217	      });
   218	      return;
   219	    }
   220	
   221	    if (existing.status !== "NOT_FOUND") {
   222	      return; // transient read error already logged by findByHashedId
   223	    }
   224	
   225	    const tenantTheme = await GetTenantTheme(tenantSlug);
   226	    const authMethod: UserAuthMethod =
   227	      tenantTheme.status === "OK" ? tenantTheme.response.authMethod : "username-password";
   228	
   229	    const seeded: UserAccount = {
   230	      id: userAccountDocId(tenantSlug, hashedId),
   231	      type: USER_ACCOUNT_ATTRIBUTE,
   232	      userId: tenantSlug,
   233	      tenantSlug,
   234	      hashedId,
   235	      displayName: user.name,
   236	      email: user.email,
   237	      // First-ever user for a tenant, or any email covered by
   238	      // ADMIN_EMAIL_ADDRESS, seeds as admin so a fresh tenant is never
   239	      // locked out of its own /admin section.
   240	      role: user.isAdmin ? "admin" : "user",
   241	      authMethod,
   242	      tags: {},
   243	      createdAt: now,
   244	      lastLoginAt: now,
   245	      status: "active",
   246	      onboardingCompletedAt: null,
   247	    };
   248	
   249	    await ConfigContainer().items.create<UserAccount>(seeded);
   250	  } catch (error) {
   251	    // Cosmos raises 409 if a concurrent request already created/updated the
   252	    // same doc first — not an error, just lost a race. Anything else: log
   253	    // and swallow, never break the authenticated app shell over this.
   254	    const code = (error as { code?: number })?.code;
   255	    if (code !== 409) {
   256	      safeLog.error("admin.users.ensure-on-login-failed");
   257	    }
   258	  }
   259	};
   260	
   261	/**
   262	 * First-login onboarding status (Stage 5c, SAD §18 Phase F) for the
   263	 * CURRENT authenticated user. Called once per authenticated page load
   264	 * (see `(authenticated)/layout.tsx`, right after `EnsureUserOnLogin` — so
   265	 * by the time this runs, the caller's own directory entry is guaranteed to
   266	 * already exist), to decide whether to auto-open the onboarding modal.
   267	 *
   268	 * Fails OPEN to "already completed" on a lookup error — a Cosmos hiccup
   269	 * must never re-surface the onboarding flow to an existing user who has
   270	 * already seen/skipped it; the flow is also always reachable again from
   271	 * the Help panel regardless of this result.
   272	 */
   273	export const GetOnboardingStatus = async (): Promise<{ completed: boolean }> => {
   274	  try {
   275	    const tenantSlug = await getCurrentTenantSlug();
   276	    const hashedId = await userHashedId();
   277	    const existing = await findByHashedId(tenantSlug, hashedId);
   278	
   279	    if (existing.status === "OK") {
   280	      return { completed: Boolean(existing.response.onboardingCompletedAt) };
   281	    }
   282	    if (existing.status === "NOT_FOUND") {
   283	      // Genuinely brand new user — should not happen post-`EnsureUserOnLogin`,
   284	      // but if it does, show onboarding (the safe default for a new user).
   285	      return { completed: false };
   286	    }
   287	    return { completed: true }; // transient read error — fail open, don't nag
   288	  } catch {
   289	    return { completed: true };
   290	  }
   291	};
   292	
   293	/**
   294	 * Marks onboarding complete (or explicitly skipped — both are "don't ask
   295	 * again", per the Stage 5c brief's "skippable" requirement) for the current
   296	 * authenticated user. Best-effort: a write failure here must never block
   297	 * the user from closing/using the onboarding modal — the client always
   298	 * treats it as dismissed regardless of whether this persisted.
   299	 */
   300	export const MarkOnboardingCompleted = async (): Promise<void> => {
   301	  try {
   302	    const tenantSlug = await getCurrentTenantSlug();
   303	    const hashedId = await userHashedId();
   304	    const existing = await findByHashedId(tenantSlug, hashedId);
   305	    if (existing.status !== "OK") return;
   306	
   307	    await ConfigContainer().items.upsert<UserAccount>({
   308	      ...existing.response,
   309	      onboardingCompletedAt: new Date().toISOString(),
   310	    });
   311	  } catch {
   312	    safeLog.error("admin.users.mark-onboarding-completed-failed");
   313	  }
   314	};
   315	
   316	export const CreateUser = async (input: {
   317	  displayName: string;
   318	  email: string;
   319	  role: UserRole;
   320	  tags: Record<string, string>;
   321	}): Promise<ServerActionResponse<UserAccount>> => {
   322	  try {
   323	    const tenantSlug = await getCurrentTenantSlug();
   324	    const hashedId = hashValue(input.email.trim().toLowerCase());
   325	    const tenantTheme = await GetTenantTheme(tenantSlug);
   326	    const authMethod: UserAuthMethod =
   327	      tenantTheme.status === "OK" ? tenantTheme.response.authMethod : "username-password";
   328	
   329	    const now = new Date().toISOString();
   330	    const model: UserAccount = {
   331	      id: userAccountDocId(tenantSlug, hashedId),
   332	      type: USER_ACCOUNT_ATTRIBUTE,
   333	      userId: tenantSlug,
   334	      tenantSlug,
   335	      hashedId,
   336	      displayName: input.displayName,
   337	      email: input.email,
   338	      role: input.role,
   339	      authMethod,
   340	      tags: input.tags,
   341	      createdAt: now,
   342	      lastLoginAt: null,
   343	      status: "active",
   344	      onboardingCompletedAt: null,
   345	    };
   346	
   347	    const parsed = UserAccountSchema.safeParse(model);
   348	    if (!parsed.success) {
   349	      return {
   350	        status: "ERROR",
   351	        errors: zodErrorsToServerActionErrors(parsed.error.errors),
   352	      };
   353	    }
   354	
   355	    const { resource } = await ConfigContainer().items.create<UserAccount>(parsed.data);
   356	    if (!resource) {
   357	      return { status: "ERROR", errors: [{ message: "Unable to create user." }] };
   358	    }
   359	    return { status: "OK", response: resource };
   360	  } catch (error) {

exec
/bin/zsh -lc "nl -ba src/features/common/services/audio-validation.ts | sed -n '1,220p'" in /Users/hugosson/workspace/SalesPrism
 succeeded in 0ms:
     1	/**
     2	 * Pure validation for STT audio uploads (SR-003 remediation,
     3	 * docs/Sales_Prism_SAD_v2.7.md decisions log line 1376). No Azure/network
     4	 * dependency — this is the "abuse surface" guard the
     5	 * `/api/speech/transcribe` route runs BEFORE ever calling Azure Speech, so
     6	 * it is deliberately kept dependency-free and unit-testable in isolation.
     7	 *
     8	 * The server only ever accepts a mono, uncompressed PCM WAV file (see
     9	 * `wav-encoder.ts` on the client, which always produces exactly this
    10	 * format before upload) — never a compressed container (webm/opus, mp4,
    11	 * ogg). That keeps this parser simple and keeps the server from ever
    12	 * needing a codec/GStreamer dependency that isn't verified as available on
    13	 * the Azure App Service Linux Node runtime.
    14	 */
    15	
    16	/** 10MB — generous for a ~2 minute mono 16-bit/16kHz WAV recording (see MAX_AUDIO_DURATION_SECONDS), tight enough to bound a single abusive upload. */
    17	export const MAX_AUDIO_UPLOAD_BYTES = 10 * 1024 * 1024;
    18	
    19	/** 2 minutes — long enough to dictate a meeting update or customer observation, short enough to bound both abuse and Azure Speech per-call cost. */
    20	export const MAX_AUDIO_DURATION_SECONDS = 120;
    21	
    22	/** RIFF header (12 bytes) + at least one 8-byte chunk header. */
    23	const MIN_WAV_HEADER_BYTES = 20;
    24	
    25	/** WAVE_FORMAT_PCM — the only `fmt ` audioFormat this server accepts. */
    26	const WAVE_FORMAT_PCM = 1;
    27	
    28	export type WavHeaderInfo = {
    29	  sampleRate: number;
    30	  numChannels: number;
    31	  bitsPerSample: number;
    32	  /** Bytes of actual audio payload (the `data` chunk), clamped to what's actually present in the buffer. */
    33	  dataSize: number;
    34	  durationSeconds: number;
    35	};
    36	
    37	export type AudioValidationErrorCode =
    38	  | "audio_empty"
    39	  | "audio_too_large"
    40	  | "audio_invalid_format"
    41	  | "audio_too_long";
    42	
    43	export type AudioValidationError = {
    44	  ok: false;
    45	  status: 400 | 413;
    46	  code: AudioValidationErrorCode;
    47	  message: string;
    48	};
    49	
    50	export type AudioValidationResult = { ok: true; header: WavHeaderInfo } | AudioValidationError;
    51	
    52	/**
    53	 * Parses a RIFF/WAVE header and locates the `fmt ` and `data` chunks.
    54	 * Returns `null` for anything that isn't a well-formed, uncompressed PCM
    55	 * WAV buffer — malformed input, a compressed `fmt ` tag (webm/opus, mp3,
    56	 * ...), or a truncated/missing `data` chunk.
    57	 *
    58	 * Duration is derived independently from the parsed sample rate / bit
    59	 * depth / channel count and the *actual* number of bytes present — a
    60	 * client-declared duration is never trusted.
    61	 */
    62	export const parseWavHeader = (buffer: Buffer): WavHeaderInfo | null => {
    63	  if (buffer.length < MIN_WAV_HEADER_BYTES) return null;
    64	  if (buffer.toString("ascii", 0, 4) !== "RIFF") return null;
    65	  if (buffer.toString("ascii", 8, 12) !== "WAVE") return null;
    66	
    67	  let offset = 12;
    68	  let fmt:
    69	    | { audioFormat: number; numChannels: number; sampleRate: number; bitsPerSample: number }
    70	    | null = null;
    71	  let dataSize: number | null = null;
    72	
    73	  // Chunks are word-aligned (padded to an even byte count); walk them
    74	  // until we've found both `fmt ` and `data`, or run out of buffer.
    75	  while (offset + 8 <= buffer.length) {
    76	    const chunkId = buffer.toString("ascii", offset, offset + 4);
    77	    const chunkSize = buffer.readUInt32LE(offset + 4);
    78	    const chunkStart = offset + 8;
    79	
    80	    if (chunkId === "fmt " && chunkStart + 16 <= buffer.length) {
    81	      fmt = {
    82	        audioFormat: buffer.readUInt16LE(chunkStart),
    83	        numChannels: buffer.readUInt16LE(chunkStart + 2),
    84	        sampleRate: buffer.readUInt32LE(chunkStart + 4),
    85	        bitsPerSample: buffer.readUInt16LE(chunkStart + 14),
    86	      };
    87	    }
    88	
    89	    if (chunkId === "data") {
    90	      // Some encoders write a placeholder/streaming size larger than what's
    91	      // actually present (or 0xFFFFFFFF) — clamp to the real buffer length
    92	      // so duration is always derived from bytes that actually exist.
    93	      dataSize = Math.max(0, Math.min(chunkSize, buffer.length - chunkStart));
    94	      break; // `data` is always the last chunk we need
    95	    }
    96	
    97	    if (chunkSize < 0) return null; // corrupt/overflowed size
    98	    offset = chunkStart + chunkSize + (chunkSize % 2);
    99	  }
   100	
   101	  if (!fmt || dataSize === null) return null;
   102	  if (fmt.audioFormat !== WAVE_FORMAT_PCM) return null;
   103	  if (fmt.sampleRate <= 0 || fmt.numChannels <= 0 || fmt.bitsPerSample <= 0) return null;
   104	
   105	  const byteRate = fmt.sampleRate * fmt.numChannels * (fmt.bitsPerSample / 8);
   106	  const durationSeconds = byteRate > 0 ? dataSize / byteRate : 0;
   107	
   108	  return {
   109	    sampleRate: fmt.sampleRate,
   110	    numChannels: fmt.numChannels,
   111	    bitsPerSample: fmt.bitsPerSample,
   112	    dataSize,
   113	    durationSeconds,
   114	  };
   115	};
   116	
   117	/**
   118	 * The single validation gate `/api/speech/transcribe` runs before ever
   119	 * calling Azure Speech. Order matters: cheap checks (size) before more
   120	 * expensive parsing, and every rejection carries the HTTP status the route
   121	 * should return verbatim — 413 for "the upload/recording is too big or too
   122	 * long" (an abuse surface), 400 for "this isn't audio we can use".
   123	 */
   124	export const validateAudioUpload = (buffer: Buffer): AudioValidationResult => {
   125	  if (buffer.length === 0) {
   126	    return { ok: false, status: 400, code: "audio_empty", message: "No audio was received." };
   127	  }
   128	
   129	  if (buffer.length > MAX_AUDIO_UPLOAD_BYTES) {
   130	    return {
   131	      ok: false,
   132	      status: 413,
   133	      code: "audio_too_large",
   134	      message: `Recording exceeds the ${Math.floor(MAX_AUDIO_UPLOAD_BYTES / (1024 * 1024))}MB limit.`,
   135	    };
   136	  }
   137	
   138	  const header = parseWavHeader(buffer);
   139	  if (!header) {
   140	    return {
   141	      ok: false,
   142	      status: 400,
   143	      code: "audio_invalid_format",
   144	      message: "Expected a mono PCM WAV recording.",
   145	    };
   146	  }
   147	
   148	  if (header.durationSeconds > MAX_AUDIO_DURATION_SECONDS) {
   149	    return {
   150	      ok: false,
   151	      status: 413,
   152	      code: "audio_too_long",
   153	      message: `Recording exceeds the ${MAX_AUDIO_DURATION_SECONDS}s limit.`,
   154	    };
   155	  }
   156	
   157	  return { ok: true, header };
   158	};
   159	
   160	/**
   161	 * Fast pre-body-read rejection using the `Content-Length` header alone —
   162	 * lets the route return 413 without ever buffering a multi-hundred-MB
   163	 * upload into memory. This is a *hint*, not the source of truth: the real
   164	 * enforcement is `validateAudioUpload`'s own `buffer.length` check once the
   165	 * body has actually been read (a client can lie about or omit
   166	 * `Content-Length`).
   167	 */
   168	export const isDeclaredContentLengthTooLarge = (contentLength: number): boolean =>
   169	  Number.isFinite(contentLength) && contentLength > MAX_AUDIO_UPLOAD_BYTES;

exec
/bin/zsh -lc "nl -ba src/features/sales-coach/stt-cleanup.ts | sed -n '1,140p'" in /Users/hugosson/workspace/SalesPrism
 succeeded in 0ms:
     1	import "server-only";
     2	
     3	import { getChatModel } from "@/features/common/services/azure-ai";
     4	import { safeLog } from "@/features/common/services/safe-logger";
     5	import { generateObject } from "ai";
     6	import { z } from "zod";
     7	
     8	/**
     9	 * STT post-processing — backlog F-02 "AI-rensning og kategorisering".
    10	 *
    11	 * One `generateObject` call (default/mini deployment — same
    12	 * `AZURE_OPENAI_CHAT_DEPLOYMENT` contract as structured-output.ts) that
    13	 * cleans filler words/false starts out of a raw speech-to-text transcript
    14	 * and classifies the seller's intent, so the chat UI can react (e.g. a
    15	 * "meeting-update" auto-starts the F-02 coaching flow via
    16	 * `intent-detection.ts`'s existing keyword path once the cleaned text is
    17	 * sent as a normal message — this module does not itself trigger that flow,
    18	 * it only prepares the text that lands in the editable input field).
    19	 *
    20	 * MUST NEVER block the user: any failure (rate limit, transient error)
    21	 * falls back to the raw transcript unchanged, category "free-chat" — the
    22	 * caller (route handler) always returns 200 with usable text, never
    23	 * surfaces a cleanup failure as a user-facing error.
    24	 */
    25	
    26	export const SttIntentCategorySchema = z.enum([
    27	  "meeting-update",
    28	  "customer-observation",
    29	  "question",
    30	  "free-chat",
    31	]);
    32	export type SttIntentCategory = z.infer<typeof SttIntentCategorySchema>;
    33	
    34	const SttCleanupResultSchema = z.object({
    35	  category: SttIntentCategorySchema,
    36	  cleanedText: z.string(),
    37	});
    38	export type SttCleanupResult = z.infer<typeof SttCleanupResultSchema>;
    39	
    40	const STT_CLEANUP_SYSTEM_PROMPT = `Du renser en rå tale-til-tekst-transskription fra en sælger, uden at ændre meningen.
    41	
    42	Regler for "cleanedText":
    43	- Fjern fyldeord (øhh, altså, ikk, hmm) og gentagelser/false starts.
    44	- Ret oplagte tale-til-tekst-fejl og sætningsstruktur, men opfind intet nyt indhold.
    45	- Bevar sprog (dansk/engelsk/norsk/svensk/tysk) og sælgerens egen ordlyd så vidt muligt — dette er en oprydning, ikke en omskrivning.
    46	- Er transskriptionen allerede ren, returér den stort set uændret.
    47	
    48	Regler for "category":
    49	- "meeting-update": sælgeren beskriver hvad der skete i et møde/en samtale.
    50	- "customer-observation": sælgeren deler en observation eller et faktum om en kunde/kontakt, uden at beskrive et konkret møde.
    51	- "question": sælgeren stiller et direkte spørgsmål der forventer et svar.
    52	- "free-chat": alt andet.`;
    53	
    54	export const cleanupSttTranscript = async (rawText: string): Promise<SttCleanupResult> => {
    55	  const trimmed = rawText.trim();
    56	  if (trimmed.length === 0) {
    57	    return { category: "free-chat", cleanedText: rawText };
    58	  }
    59	
    60	  try {
    61	    const { object } = await generateObject({
    62	      model: getChatModel(),
    63	      schema: SttCleanupResultSchema,
    64	      system: STT_CLEANUP_SYSTEM_PROMPT,
    65	      prompt: trimmed,
    66	    });
    67	    return object;
    68	  } catch {
    69	    safeLog.warn("sales-coach.stt-cleanup-failed");
    70	    return { category: "free-chat", cleanedText: rawText };
    71	  }
    72	};

exec
/bin/zsh -lc "nl -ba src/features/chat-page/chat-services/chat-handler.ts | sed -n '190,235p'" in /Users/hugosson/workspace/SalesPrism
 succeeded in 0ms:
   190	      // mounted chat-menu sidebar. Doing it here (inside a plain Route
   191	      // Handler request, not a Server Action RPC) would persist the rename
   192	      // but NOT refresh the client without an explicit `router.refresh()`.
   193	      await CreateChatMessage({
   194	        name: AI_NAME,
   195	        content: event.text,
   196	        role: "assistant",
   197	        chatThreadId: currentChatThread.id,
   198	      });
   199	
   200	      // SAD §8.6 activity tracking — best-effort, never blocks the response.
   201	      // Only counts/lengths/tokens are recorded, never prompt/response text.
   202	      await RecordPromptEvent({
   203	        tenantSlug,
   204	        actorHashedId: userId,
   205	        sessionId: currentChatThread.id,
   206	        promptLength: props.message.length,
   207	        tokensUsed: event.totalUsage.totalTokens,
   208	        modelTier: process.env.PLATFORM_TIER || "smb",
   209	      });
   210	
   211	      // Model-router per-request log (SAD §18 Phase F) — codes/enums/counts
   212	      // only, per safe-logger.ts's allow-list; tokensUsed is only known once
   213	      // the stream finishes, hence logging here rather than at selection time.
   214	      safeLog.info("chat.model-router.usage", {
   215	        requestId,
   216	        complexity: routedModel.complexity,
   217	        deploymentUsed: routedModel.deploymentName,
   218	        tokensUsed: event.totalUsage.totalTokens,
   219	      });
   220	
   221	      // F-03/F-04 — fire-and-forget customer/persona extraction. Never
   222	      // awaited: `runCustomerExtraction` catches every failure internally
   223	      // and reports only via `safeLog` (no prompt/response text), so it can
   224	      // never delay or break the chat response above.
   225	      void runCustomerExtraction({
   226	        tenantSlug,
   227	        ownerHashedId: userId,
   228	        userMessage: props.message,
   229	        assistantMessage: event.text,
   230	      });
   231	    },
   232	  });
   233	
   234	  return result.toUIMessageStreamResponse({
   235	    onError: (error) => {

exec
/bin/zsh -lc "sed -n '1,140p' src/features/chat-page/chat-input/speech/speech-availability-context.tsx" in /Users/hugosson/workspace/SalesPrism
 succeeded in 0ms:
"use client";

import { createContext, useContext } from "react";

/**
 * Speech (STT/TTS) availability — resolved server-side once per request
 * from `isSpeechConfigured()` (see azure-speech.ts) and threaded down
 * through `AuthenticatedProviders`, same pattern as `TenantThemeStyle` in
 * app/layout.tsx. This avoids an extra round-trip to the token route just
 * to answer "is voice input configured at all?" — the Speech resource
 * doesn't exist in every environment yet (Stage 5c brief: infra owned by a
 * separate workstream), so the mic button must know to hide/disable itself
 * WITHOUT the seller ever pressing it and hitting a 503.
 */
const SpeechAvailabilityContext = createContext<boolean>(false);

export const SpeechAvailabilityProvider = ({
  enabled,
  children,
}: {
  enabled: boolean;
  children: React.ReactNode;
}) => (
  <SpeechAvailabilityContext.Provider value={enabled}>
    {children}
  </SpeechAvailabilityContext.Provider>
);

/** `true` only when `AZURE_SPEECH_REGION` + `AZURE_SPEECH_RESOURCE_ID` are both set for this tenant's App Service. */
export const useSpeechAvailability = (): boolean => useContext(SpeechAvailabilityContext);

Completed the route/service review, abuse-path review, and GDPR/retention review for the requested surfaces.
  ✓ Inspect auth and authorization on new routes/pages/services, including tenant and seller scoping for customer entities and meeting briefs
  ✓ Inspect speech proxy, logging/telemetry, prompt-injection paths, and client-exposed secret risk
  ✓ Inspect GDPR deletion/retention/export behavior for new containers and admin/activity flows, then compile findings with severity and fixes
codex
**Findings**
- `HIGH` [route.ts](/Users/hugosson/workspace/SalesPrism/src/app/(authenticated)/api/speech/transcribe/route.ts:49), [audio-validation.ts](/Users/hugosson/workspace/SalesPrism/src/features/common/services/audio-validation.ts:161): `Content-Length` is treated as a hint, then the route does `await req.arrayBuffer()` before any hard enforced cap. An authenticated seller can omit or lie about `Content-Length` and stream a very large body, forcing the App Service to buffer it in memory before rejection; that is an easy tenant-level DoS on the speech path. Minimal fix: stream-read with a hard byte cap and abort once `> MAX_AUDIO_UPLOAD_BYTES`, plus an upstream body-size limit.

- `HIGH` [activity-service.ts](/Users/hugosson/workspace/SalesPrism/src/features/admin/activity-service.ts:241), [activity-service.ts](/Users/hugosson/workspace/SalesPrism/src/features/admin/activity-service.ts:272), [user-service.ts](/Users/hugosson/workspace/SalesPrism/src/features/admin/user-service.ts:210): CSV export only escapes commas/quotes/newlines; it does not neutralize cells starting with `=`, `+`, `-`, or `@`. Because login sync copies user-controlled IdP `displayName`/`email` into `UserAccount`, a malicious user can set a formula payload in their profile, wait for an admin to export/open the CSV, and get spreadsheet-formula execution/exfiltration on the admin workstation. Minimal fix: prefix formula-leading cells with `'` (or `\t`) before CSV quoting for every string field.

- `HIGH` [requirements-traceability.md](/Users/hugosson/workspace/SalesPrism/docs/requirements-traceability.md:51), [models.ts](/Users/hugosson/workspace/SalesPrism/src/features/sales-coach/models.ts:195), [models.ts](/Users/hugosson/workspace/SalesPrism/src/features/sales-coach/models.ts:286), [user-service.ts](/Users/hugosson/workspace/SalesPrism/src/features/admin/user-service.ts:50), [activity-service.ts](/Users/hugosson/workspace/SalesPrism/src/features/admin/activity-service.ts:42): the repo explicitly says GDPR erasure is “Not started”, while the new customer entities, meeting briefs, user accounts, and activity events are all persistent documents with no delete path, TTL, or expiry field. A seller/data-subject erasure request can remove chat threads yet still leave these new stores indefinitely populated with customer names, contacts, emails, last-login timestamps, onboarding state, and usage history. Minimal fix: implement an admin-only erase workflow keyed by tenant + hashed identity/customer linkage, and add enforced retention/TTL for telemetry/onboarding data.

- `MEDIUM` [route.ts](/Users/hugosson/workspace/SalesPrism/src/app/(authenticated)/api/speech/cleanup/route.ts:14), [stt-cleanup.ts](/Users/hugosson/workspace/SalesPrism/src/features/sales-coach/stt-cleanup.ts:54): `/api/speech/cleanup` has no in-handler auth recheck and no body/character cap before forwarding `rawText` into `generateObject`. Middleware blocks anonymous access today, but any signed-in user can POST arbitrarily large text and turn this into an unbounded AOAI token sink; if the matcher regresses, unlike `transcribe`/`synthesize`, the handler itself does nothing to stop anonymous callers. Minimal fix: add the same server-side auth recheck as the other speech routes, enforce strict byte/character limits, and rate-limit per seller.

- `MEDIUM` [chat-handler.ts](/Users/hugosson/workspace/SalesPrism/src/features/chat-page/chat-services/chat-handler.ts:225), [extraction-service.ts](/Users/hugosson/workspace/SalesPrism/src/features/sales-coach/extraction-service.ts:41), [structured-output.ts](/Users/hugosson/workspace/SalesPrism/src/features/sales-coach/structured-output.ts:112), [structured-output.ts](/Users/hugosson/workspace/SalesPrism/src/features/sales-coach/structured-output.ts:154): the persistence pipeline feeds both the seller’s prompt and the model’s free-form reply back into customer-insight extraction and persona classification. A malicious uploaded document or prompt injection that gets reflected into assistant prose can therefore write fabricated customers, contacts, triggers, or persona traits into the seller’s long-lived profile, which then biases future context injection and meeting briefs. Minimal fix: persist only user-authored facts or tool/evidence-anchored structured outputs; do not treat assistant prose as authoritative without explicit confirmation.

I did not find a new cross-user or cross-tenant read bypass in the reviewed `/customers`, `/briefs`, or `/api/sales-coach/meeting-briefs/[id]` paths; those reads are scoped by server-derived `tenantSlug` plus `ownerHashedId`.

VERDICT:REVISE
tokens used
148,469
**Findings**
- `HIGH` [route.ts](/Users/hugosson/workspace/SalesPrism/src/app/(authenticated)/api/speech/transcribe/route.ts:49), [audio-validation.ts](/Users/hugosson/workspace/SalesPrism/src/features/common/services/audio-validation.ts:161): `Content-Length` is treated as a hint, then the route does `await req.arrayBuffer()` before any hard enforced cap. An authenticated seller can omit or lie about `Content-Length` and stream a very large body, forcing the App Service to buffer it in memory before rejection; that is an easy tenant-level DoS on the speech path. Minimal fix: stream-read with a hard byte cap and abort once `> MAX_AUDIO_UPLOAD_BYTES`, plus an upstream body-size limit.

- `HIGH` [activity-service.ts](/Users/hugosson/workspace/SalesPrism/src/features/admin/activity-service.ts:241), [activity-service.ts](/Users/hugosson/workspace/SalesPrism/src/features/admin/activity-service.ts:272), [user-service.ts](/Users/hugosson/workspace/SalesPrism/src/features/admin/user-service.ts:210): CSV export only escapes commas/quotes/newlines; it does not neutralize cells starting with `=`, `+`, `-`, or `@`. Because login sync copies user-controlled IdP `displayName`/`email` into `UserAccount`, a malicious user can set a formula payload in their profile, wait for an admin to export/open the CSV, and get spreadsheet-formula execution/exfiltration on the admin workstation. Minimal fix: prefix formula-leading cells with `'` (or `\t`) before CSV quoting for every string field.

- `HIGH` [requirements-traceability.md](/Users/hugosson/workspace/SalesPrism/docs/requirements-traceability.md:51), [models.ts](/Users/hugosson/workspace/SalesPrism/src/features/sales-coach/models.ts:195), [models.ts](/Users/hugosson/workspace/SalesPrism/src/features/sales-coach/models.ts:286), [user-service.ts](/Users/hugosson/workspace/SalesPrism/src/features/admin/user-service.ts:50), [activity-service.ts](/Users/hugosson/workspace/SalesPrism/src/features/admin/activity-service.ts:42): the repo explicitly says GDPR erasure is “Not started”, while the new customer entities, meeting briefs, user accounts, and activity events are all persistent documents with no delete path, TTL, or expiry field. A seller/data-subject erasure request can remove chat threads yet still leave these new stores indefinitely populated with customer names, contacts, emails, last-login timestamps, onboarding state, and usage history. Minimal fix: implement an admin-only erase workflow keyed by tenant + hashed identity/customer linkage, and add enforced retention/TTL for telemetry/onboarding data.

- `MEDIUM` [route.ts](/Users/hugosson/workspace/SalesPrism/src/app/(authenticated)/api/speech/cleanup/route.ts:14), [stt-cleanup.ts](/Users/hugosson/workspace/SalesPrism/src/features/sales-coach/stt-cleanup.ts:54): `/api/speech/cleanup` has no in-handler auth recheck and no body/character cap before forwarding `rawText` into `generateObject`. Middleware blocks anonymous access today, but any signed-in user can POST arbitrarily large text and turn this into an unbounded AOAI token sink; if the matcher regresses, unlike `transcribe`/`synthesize`, the handler itself does nothing to stop anonymous callers. Minimal fix: add the same server-side auth recheck as the other speech routes, enforce strict byte/character limits, and rate-limit per seller.

- `MEDIUM` [chat-handler.ts](/Users/hugosson/workspace/SalesPrism/src/features/chat-page/chat-services/chat-handler.ts:225), [extraction-service.ts](/Users/hugosson/workspace/SalesPrism/src/features/sales-coach/extraction-service.ts:41), [structured-output.ts](/Users/hugosson/workspace/SalesPrism/src/features/sales-coach/structured-output.ts:112), [structured-output.ts](/Users/hugosson/workspace/SalesPrism/src/features/sales-coach/structured-output.ts:154): the persistence pipeline feeds both the seller’s prompt and the model’s free-form reply back into customer-insight extraction and persona classification. A malicious uploaded document or prompt injection that gets reflected into assistant prose can therefore write fabricated customers, contacts, triggers, or persona traits into the seller’s long-lived profile, which then biases future context injection and meeting briefs. Minimal fix: persist only user-authored facts or tool/evidence-anchored structured outputs; do not treat assistant prose as authoritative without explicit confirmation.

I did not find a new cross-user or cross-tenant read bypass in the reviewed `/customers`, `/briefs`, or `/api/sales-coach/meeting-briefs/[id]` paths; those reads are scoped by server-derived `tenantSlug` plus `ownerHashedId`.

VERDICT:REVISE

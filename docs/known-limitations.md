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

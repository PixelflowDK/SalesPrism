# Known Limitations

**Purpose:** Track known gaps, deferred work, and constraints that are accepted for now but should be revisited. Not a bug tracker — durable, structural limitations only.

| Date added | Limitation | Impact | Revisit when |
|---|---|---|---|
| 2026-07-30 | Professional (gpt-5.4) and Enterprise (gpt-5.5) model tiers are quota-gated in DataZoneStandard westeurope — only gpt-5.4-mini is currently granted | New customers can only be provisioned on the Standard tier until quota is approved | Quota increase request approved (see `azure-quotas` skill) |
| 2026-07-30 | Embeddings run on text-embedding-3-small; text-embedding-3-large is quota-gated | Slightly lower retrieval quality vs. target embedding model | text-embedding-3-large quota granted (ADR-001) |
| 2026-07-30 | Entra External ID CIAM tenant not yet created | Username/Password auth method (Auth Method B, SAD §8.3) cannot be provisioned yet — only Entra ID SSO available | CIAM tenant provisioned in Phase D |
| 2026-07-30 | `DESIGN.md` regeneration pending | Design tokens in code may not yet reflect the finalized Copper Fjord/Nordic Moss/Fjord Teal/Warm Stone palette from the SAD decisions log | DESIGN.md regenerated from Stitch project "Sales Coaching Conversation View" |

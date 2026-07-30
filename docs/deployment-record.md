# Deployment Record

**Purpose:** Log every customer/environment deployment — what was deployed, where, when, and by whom/what workflow. This is the audit trail for provisioning actions.

| Date | Customer slug | Environment | Region | Model tier | Deployed by | Status | Notes |
|---|---|---|---|---|---|---|---|
| 2026-07-30 | — | — | — | — | — | No deployments yet | `provision-customer.yml` does not exist yet (Stage 3c). First entry expected after Stage 3 validation deployment. |

## Validation environment — pre-deployment record (2026-07-30)
- Subscription reconfirmed: "Azure subscription 1" (ceb8f0de-...)
- Target: rg-azurechat-val1, westeurope, environmentTag=validation
- SKUs: App Service B1, AI Search Basic, Cosmos serverless, DocIntel S0, KV std, Storage LRS, VNet+5 PEs, LAW+AppInsights 30d
- Models: gpt-5.4-mini (2026-03-17) DZS cap 100; text-embedding-3-small v1 DZS cap 100
- Estimated monthly cost: ≈ 714–724 kr/md (~720 kr) — within authorized 650–1,100 range
- Method: az deployment sub create --mode Incremental (what-if first)

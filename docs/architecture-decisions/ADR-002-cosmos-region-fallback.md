# ADR-002: Cosmos DB Region Fallback (EU-only) for Capacity-Gated Regions

**Status:** Accepted
**Date:** 2026-07-30
**Amends:** SAD v2.7 R1 (region list) — for the Cosmos DB account only

## Context

Validation deployments r1–r3 (2026-07-30) failed identically: `ServiceUnavailable — high demand … for the zonal redundant (Availability Zones) accounts` from the Cosmos `serviceReservation` step, in **both** westeurope and northeurope, with `isZoneRedundant: false` verified in the compiled template. Serverless Cosmos account creation for this subscription is capacity/region-access gated in both primary regions (see aka.ms/cosmosdbquota). All other services deployed fine.

## Decision

1. `cosmosRegion` allowed values extended to `['northeurope', 'westeurope', 'swedencentral']` — **EU-only**, inside the Microsoft EU Data Boundary. Preference order: azureRegion → the other primary → swedencentral.
2. This applies to the Cosmos DB account **only**; every other resource remains bound by R1 (northeurope/westeurope) and AI remains pinned to westeurope (ADR-001).
3. If swedencentral is also refused, the deployment stops and an operator files a Cosmos region-access request (aka.ms/cosmosdbquota) — recorded as an external blocker.
4. Revisit and collapse back to the customer's primary region once the subscription's region access is granted (it becomes a one-parameter redeploy per SAD §21.3).

## Consequences

- EU data residency (R2/GDPR) is preserved; the SAD's two-region simplification is loosened for one resource type under documented capacity duress.
- Chat-history latency between the westeurope App Service and a swedencentral Cosmos account is intra-EU (~20–30 ms RTT) — acceptable for chat persistence writes (async onFinish) and reads.
- Customer-facing documentation (DPA annex, region list) must mention swedencentral as a possible Cosmos region while the gate persists.

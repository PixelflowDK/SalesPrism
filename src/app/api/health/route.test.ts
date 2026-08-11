import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { GET } from "./route";

/**
 * These tests defend the contract the provisioning gate depends on
 * (.github/workflows/provision-customer.yml, "Gate — deployed build matches
 * this run"). If any assertion here regresses, the gate silently stops being
 * able to detect a failed deployment — which is the failure mode the gate
 * exists to catch, so it must not be able to rot unnoticed.
 */
describe("GET /api/health — deployment gate contract", () => {
  const originalSha = process.env.SALESPRISM_BUILD_SHA;
  const originalTime = process.env.SALESPRISM_BUILD_TIME;

  beforeEach(() => {
    process.env.SALESPRISM_BUILD_SHA = "abc1234";
    process.env.SALESPRISM_BUILD_TIME = "2026-08-11T00:00:00.000Z";
  });

  afterEach(() => {
    // `env` in next.config.js inlines these in a real build; in vitest they are
    // ordinary env vars, so restore whatever the runner had.
    if (originalSha === undefined) delete process.env.SALESPRISM_BUILD_SHA;
    else process.env.SALESPRISM_BUILD_SHA = originalSha;
    if (originalTime === undefined) delete process.env.SALESPRISM_BUILD_TIME;
    else process.env.SALESPRISM_BUILD_TIME = originalTime;
  });

  it("reports the build commit the gate compares against", async () => {
    const res = await GET();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("ok");
    // The gate does an exact string compare against `${GITHUB_SHA:0:7}`.
    expect(body.commit).toBe("abc1234");
    expect(body.buildTime).toBe("2026-08-11T00:00:00.000Z");
  });

  it("reports 'unknown' rather than omitting the commit when not built by CI", async () => {
    delete process.env.SALESPRISM_BUILD_SHA;

    const body = await (await GET()).json();

    // The gate treats a literal "unknown" as an immediate hard failure (a
    // locally built artifact reached production). It must therefore be present
    // and spelled exactly this way — an absent/null field would make
    // `jq -r '.commit // empty'` yield "" instead, which the gate interprets as
    // "not up yet" and retries for five minutes before failing with a
    // misleading timeout message.
    expect(body.commit).toBe("unknown");
  });

  it("forbids caching, so the gate can never read a stale answer", async () => {
    const cacheControl = (await GET()).headers.get("cache-control") ?? "";

    // A cached health response is the same class of defect as the stale
    // service-worker cache that once made a dead build look alive.
    expect(cacheControl).toContain("no-store");
    expect(cacheControl).toContain("no-cache");
    expect(cacheControl).toContain("max-age=0");
  });

  it("discloses nothing beyond build provenance", async () => {
    const body = await (await GET()).json();

    // Public, unauthenticated endpoint (deliberately excluded from
    // middleware.ts's matcher). Keep the payload to exactly these three keys —
    // adding env, config, resource names or versions here would leak to
    // anonymous callers.
    expect(Object.keys(body).sort()).toEqual(["buildTime", "commit", "status"]);
  });
});

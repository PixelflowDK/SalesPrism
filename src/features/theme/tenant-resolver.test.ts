import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  normalizeHost,
  getDefaultTenantSlug,
  resolveTenantSlug,
  TENANT_SUBDOMAIN_PATTERN,
} from "./tenant-resolver";

describe("normalizeHost", () => {
  it("strips a trailing port", () => {
    expect(normalizeHost("dsv-sales360.pixelflow.dk:3000")).toBe(
      "dsv-sales360.pixelflow.dk"
    );
  });

  it("lowercases the host", () => {
    expect(normalizeHost("DSV-SALES360.PIXELFLOW.DK")).toBe(
      "dsv-sales360.pixelflow.dk"
    );
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeHost("  dsv-sales360.pixelflow.dk  ")).toBe(
      "dsv-sales360.pixelflow.dk"
    );
  });

  it("returns empty string for null/undefined", () => {
    expect(normalizeHost(null)).toBe("");
    expect(normalizeHost(undefined)).toBe("");
  });

  it("returns empty string for an empty header", () => {
    expect(normalizeHost("")).toBe("");
  });
});

describe("getDefaultTenantSlug", () => {
  const ORIGINAL_ENV = process.env.TENANT_SLUG;

  afterEach(() => {
    if (ORIGINAL_ENV === undefined) {
      delete process.env.TENANT_SLUG;
    } else {
      process.env.TENANT_SLUG = ORIGINAL_ENV;
    }
  });

  it("falls back to val1 when TENANT_SLUG is unset", () => {
    delete process.env.TENANT_SLUG;
    expect(getDefaultTenantSlug()).toBe("val1");
  });

  it("falls back to val1 when TENANT_SLUG is blank/whitespace", () => {
    process.env.TENANT_SLUG = "   ";
    expect(getDefaultTenantSlug()).toBe("val1");
  });

  it("uses TENANT_SLUG when configured", () => {
    process.env.TENANT_SLUG = "dsv";
    expect(getDefaultTenantSlug()).toBe("dsv");
  });

  it("trims TENANT_SLUG", () => {
    process.env.TENANT_SLUG = "  dsv  ";
    expect(getDefaultTenantSlug()).toBe("dsv");
  });
});

describe("resolveTenantSlug", () => {
  const ORIGINAL_ENV = process.env.TENANT_SLUG;

  beforeEach(() => {
    delete process.env.TENANT_SLUG;
  });

  afterEach(() => {
    if (ORIGINAL_ENV === undefined) {
      delete process.env.TENANT_SLUG;
    } else {
      process.env.TENANT_SLUG = ORIGINAL_ENV;
    }
  });

  it("resolves a valid customer subdomain", () => {
    expect(resolveTenantSlug("dsv-sales360.pixelflow.dk")).toBe("dsv");
  });

  it("resolves a valid customer subdomain with a port", () => {
    expect(resolveTenantSlug("dsv-sales360.pixelflow.dk:443")).toBe("dsv");
  });

  it("is case-insensitive on the host (uppercase host still resolves)", () => {
    expect(resolveTenantSlug("DSV-SALES360.PIXELFLOW.DK")).toBe("dsv");
  });

  it("accepts the minimum slug length (2 chars)", () => {
    expect(resolveTenantSlug("ab-sales360.pixelflow.dk")).toBe("ab");
  });

  it("accepts the maximum slug length (20 chars)", () => {
    const slug20 = "a".padEnd(20, "b"); // "a" + 19 chars = 20
    expect(slug20.length).toBe(20);
    expect(resolveTenantSlug(`${slug20}-sales360.pixelflow.dk`)).toBe(slug20);
  });

  it("REJECTS a 21-char slug and falls back to the default tenant, not a truncated/partial match", () => {
    const slug21 = "a".padEnd(21, "b");
    expect(slug21.length).toBe(21);
    process.env.TENANT_SLUG = "__default__";
    expect(resolveTenantSlug(`${slug21}-sales360.pixelflow.dk`)).toBe(
      "__default__"
    );
  });

  it("REJECTS a 1-char slug and falls back to the default tenant", () => {
    process.env.TENANT_SLUG = "__default__";
    expect(resolveTenantSlug("a-sales360.pixelflow.dk")).toBe("__default__");
  });

  it("falls back to the default tenant slug for localhost", () => {
    process.env.TENANT_SLUG = "__default__";
    expect(resolveTenantSlug("localhost:3000")).toBe("__default__");
  });

  it("falls back to the default tenant slug for an azurewebsites.net staging slot", () => {
    process.env.TENANT_SLUG = "__default__";
    expect(resolveTenantSlug("app-azurechat-val1.azurewebsites.net")).toBe(
      "__default__"
    );
  });

  it("falls back to the default tenant slug when the Host header is missing", () => {
    process.env.TENANT_SLUG = "__default__";
    expect(resolveTenantSlug(null)).toBe("__default__");
    expect(resolveTenantSlug(undefined)).toBe("__default__");
  });

  // SECURITY-RELEVANT: hosts that merely resemble a valid tenant host, or
  // that try to smuggle a different apex domain, must NOT resolve to any
  // tenant slug other than the safe default. A false-positive match here
  // would let a spoofed Host header address another tenant's data.
  describe("security: hosts that must NOT match a tenant", () => {
    const ORIGINAL = process.env.TENANT_SLUG;
    beforeEach(() => {
      process.env.TENANT_SLUG = "__default__";
    });
    afterEach(() => {
      if (ORIGINAL === undefined) delete process.env.TENANT_SLUG;
      else process.env.TENANT_SLUG = ORIGINAL;
    });

    it("rejects a lookalike apex domain (evil.dk hosting a pixelflow.dk-looking label)", () => {
      expect(resolveTenantSlug("dsv-sales360.pixelflow.dk.evil.dk")).toBe(
        "__default__"
      );
    });

    it("rejects a host with the tenant pattern as a PATH-like prefix on another domain", () => {
      expect(resolveTenantSlug("evil.dk/dsv-sales360.pixelflow.dk")).toBe(
        "__default__"
      );
    });

    it("rejects a subdomain nested one level deeper than the flat pattern allows", () => {
      expect(
        resolveTenantSlug("nested.dsv-sales360.pixelflow.dk")
      ).toBe("__default__");
    });

    it("rejects a slug starting with a digit", () => {
      expect(resolveTenantSlug("1dsv-sales360.pixelflow.dk")).toBe(
        "__default__"
      );
    });

    it("rejects a missing '-sales360' separator", () => {
      expect(resolveTenantSlug("dsv.pixelflow.dk")).toBe("__default__");
    });

    it("rejects an empty slug (bare '-sales360.pixelflow.dk')", () => {
      expect(resolveTenantSlug("-sales360.pixelflow.dk")).toBe("__default__");
    });
  });
});

describe("TENANT_SUBDOMAIN_PATTERN (exported regex sanity)", () => {
  it("is anchored (no partial-string matches)", () => {
    expect(TENANT_SUBDOMAIN_PATTERN.test("xdsv-sales360.pixelflow.dkx")).toBe(
      false
    );
  });
});

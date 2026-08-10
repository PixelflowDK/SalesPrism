import { beforeEach, describe, expect, it, vi } from "vitest";

// Hermetic unit test for ADR-003's identity plumbing: mock `next-auth`'s
// `getServerSession` (so we control the session shape per test) and
// `./auth-api`'s `options` export (so loading this file never pulls in the
// real NextAuth() call / real provider configuration in auth-api.ts — that
// module is exercised separately, this file is about `helpers.ts` only).
const getServerSessionMock = vi.fn();
vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSessionMock(...args),
}));
vi.mock("./auth-api", () => ({ options: {} }));

import {
  buildCanonicalUserId,
  canonicalUserId,
  currentUserId,
  getCurrentUser,
  userSession,
} from "./helpers";

const TENANT_A = "d4b1b55b-6c92-4419-9a08-956e975dce86";
const TENANT_B = "11111111-2222-3333-4444-555555555555";
const OID_1 = "7d37f13b-d198-4421-81c6-f0f9076049c7";

const baseUser = {
  name: "Real Seller Name",
  email: "seller@example.com",
  image: "https://example.com/avatar.png",
  isAdmin: false,
};

describe("buildCanonicalUserId — ADR-003 pure builder", () => {
  it("returns `${tenantId}:${oid}`, lowercased", () => {
    expect(buildCanonicalUserId("ABCD-1234", "WXYZ-9876")).toBe("abcd-1234:wxyz-9876");
  });

  it.each([
    ["undefined oid", TENANT_A, undefined],
    ["null oid", TENANT_A, null],
    ["empty-string oid", TENANT_A, ""],
  ])("fails closed when %s is passed", (_label, tenantId, oid) => {
    expect(() => buildCanonicalUserId(tenantId, oid)).toThrow(/fail-closed/i);
  });

  it.each([
    ["undefined tenantId", undefined, OID_1],
    ["null tenantId", null, OID_1],
    ["empty-string tenantId", "", OID_1],
  ])("fails closed when %s is passed", (_label, tenantId, oid) => {
    expect(() => buildCanonicalUserId(tenantId, oid)).toThrow(/fail-closed/i);
  });

  it("ownership stability: identical oid+tid always collapse to the identical canonical id regardless of claim casing", () => {
    expect(buildCanonicalUserId(TENANT_A, OID_1)).toBe(
      buildCanonicalUserId(TENANT_A.toUpperCase(), OID_1.toUpperCase())
    );
  });

  it("cross-tenant isolation: the SAME oid under a DIFFERENT tid is a different principal", () => {
    expect(buildCanonicalUserId(TENANT_A, OID_1)).not.toBe(buildCanonicalUserId(TENANT_B, OID_1));
  });
});

describe("canonicalUserId() / currentUserId() — session-derived, fail closed", () => {
  beforeEach(() => {
    getServerSessionMock.mockReset();
  });

  const sessionWith = (overrides: {
    oid?: string;
    tenantId?: string;
    email?: string;
  }) => ({
    user: {
      ...baseUser,
      email: overrides.email ?? baseUser.email,
      oid: overrides.oid,
      tenantId: overrides.tenantId,
    },
  });

  it("currentUserId is the exact same function as canonicalUserId (renamed userHashedId call sites use it)", () => {
    expect(currentUserId).toBe(canonicalUserId);
  });

  it("regression guard: the canonical id is UNCHANGED when email/preferred_username/mail/upn all change, as long as oid+tid stay constant — this is the exact failure mode ADR-003 replaces (hashValue(email-fallback-chain) silently changing ownership between logins)", async () => {
    getServerSessionMock.mockResolvedValueOnce(
      sessionWith({ oid: OID_1, tenantId: TENANT_A, email: "old.address@example.com" })
    );
    const first = await canonicalUserId();

    // Simulate a second login where every mutable display/contact claim
    // changed (email, and — per the ADR's val1 finding — this could equally
    // be preferred_username/mail/upn, none of which this function ever
    // reads) but the verified oid/tid did not.
    getServerSessionMock.mockResolvedValueOnce(
      sessionWith({ oid: OID_1, tenantId: TENANT_A, email: "brand.new.address@example.com" })
    );
    const second = await canonicalUserId();

    expect(first).toBe(second);
    expect(first).toBe(`${TENANT_A.toLowerCase()}:${OID_1.toLowerCase()}`);
  });

  it("fails closed: a session missing the oid claim throws rather than falling back to email", async () => {
    getServerSessionMock.mockResolvedValueOnce(
      sessionWith({ tenantId: TENANT_A, oid: undefined })
    );
    await expect(canonicalUserId()).rejects.toThrow(/fail-closed/i);
  });

  it("fails closed: a session missing the tid claim throws rather than falling back to email", async () => {
    getServerSessionMock.mockResolvedValueOnce(sessionWith({ oid: OID_1, tenantId: undefined }));
    await expect(canonicalUserId()).rejects.toThrow(/fail-closed/i);
  });

  it("fails closed: no session at all throws (pre-existing behavior, unchanged by ADR-003)", async () => {
    getServerSessionMock.mockResolvedValueOnce(null);
    await expect(canonicalUserId()).rejects.toThrow(/user not found/i);
  });

  it("cross-tenant isolation end-to-end: the SAME oid under a DIFFERENT tid resolves to a DIFFERENT canonical id via the full session path", async () => {
    getServerSessionMock.mockResolvedValueOnce(sessionWith({ oid: OID_1, tenantId: TENANT_A }));
    const principalA = await canonicalUserId();

    getServerSessionMock.mockResolvedValueOnce(sessionWith({ oid: OID_1, tenantId: TENANT_B }));
    const principalB = await canonicalUserId();

    expect(principalA).not.toBe(principalB);
  });

  it("userSession()/getCurrentUser() still succeed for display purposes even when oid/tid are both missing — only the ownership-sensitive canonicalUserId()/currentUserId() fail closed, so a hypothetical session without verified claims doesn't also break name/avatar display", async () => {
    getServerSessionMock.mockResolvedValueOnce(
      sessionWith({ oid: undefined, tenantId: undefined })
    );
    const user = await getCurrentUser();
    expect(user.name).toBe(baseUser.name);
    expect(user.canonicalUserId).toBeUndefined();

    // But the ownership-sensitive accessor over the SAME session still fails closed.
    getServerSessionMock.mockResolvedValueOnce(
      sessionWith({ oid: undefined, tenantId: undefined })
    );
    await expect(currentUserId()).rejects.toThrow(/fail-closed/i);
  });

  it("userSession() returns null (not a throw) when there is no session at all — getCurrentUser()/canonicalUserId() are the ones that turn that into a thrown error", async () => {
    getServerSessionMock.mockResolvedValueOnce(null);
    expect(await userSession()).toBeNull();
  });
});

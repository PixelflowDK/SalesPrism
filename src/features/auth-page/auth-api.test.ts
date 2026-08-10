import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getAdminObjectIds, isAdminOid } from "./auth-api";

/**
 * ADR-003 admin authorization — `ADMIN_OBJECT_IDS` (comma-separated Entra
 * `oid` values), compared against the verified `oid` claim only. Never
 * `ADMIN_EMAIL_ADDRESS` (removed) and never a client-supplied value —
 * `isAdminOid`/`getAdminObjectIds` only ever see values this module itself
 * read from `process.env` or a provider's own decoded token claims (see
 * `auth-api.ts`'s `profile()` callbacks), never anything from a request
 * body/query/header.
 */
describe("ADMIN_OBJECT_IDS admin authorization (ADR-003)", () => {
  const ORIGINAL_ADMIN_OBJECT_IDS = process.env.ADMIN_OBJECT_IDS;
  const ADMIN_OID = "7d37f13b-d198-4421-81c6-f0f9076049c7"; // val1's authorized oid
  const OTHER_OID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

  beforeEach(() => {
    process.env.ADMIN_OBJECT_IDS = `${ADMIN_OID},${OTHER_OID.toUpperCase()}`;
  });

  afterEach(() => {
    if (ORIGINAL_ADMIN_OBJECT_IDS === undefined) {
      delete (process.env as Record<string, string | undefined>).ADMIN_OBJECT_IDS;
    } else {
      process.env.ADMIN_OBJECT_IDS = ORIGINAL_ADMIN_OBJECT_IDS;
    }
  });

  it("an oid present in ADMIN_OBJECT_IDS is admin", () => {
    expect(isAdminOid(ADMIN_OID)).toBe(true);
  });

  it("an oid NOT present in ADMIN_OBJECT_IDS is denied", () => {
    expect(isAdminOid("00000000-0000-0000-0000-000000000000")).toBe(false);
  });

  it("comparison is case-insensitive (Entra oids/GUIDs are not reliably cased consistently across claims)", () => {
    expect(isAdminOid(ADMIN_OID.toUpperCase())).toBe(true);
    expect(isAdminOid(OTHER_OID.toLowerCase())).toBe(true);
  });

  it("a missing/undefined/null oid is denied, never treated as a wildcard match", () => {
    expect(isAdminOid(undefined)).toBe(false);
    expect(isAdminOid(null)).toBe(false);
    expect(isAdminOid("")).toBe(false);
  });

  it("changing a user's display email does NOT change authorization — isAdminOid only ever takes an oid, so an admin's email/preferred_username/mail/upn mutating between logins (the ADR's val1 finding) cannot flip admin status either way", () => {
    // Same oid, two different simulated "logins" with different display
    // claims — isAdminOid has no email parameter at all, so both profile
    // shapes below necessarily produce the identical authorization result.
    const loginOneProfile = { oid: ADMIN_OID, email: "old.name@example.com" };
    const loginTwoProfile = { oid: ADMIN_OID, email: "renamed@different-domain.example" };

    expect(isAdminOid(loginOneProfile.oid)).toBe(isAdminOid(loginTwoProfile.oid));
    expect(isAdminOid(loginOneProfile.oid)).toBe(true);
  });

  it("getAdminObjectIds trims whitespace and drops empty entries from the comma-separated env var", () => {
    process.env.ADMIN_OBJECT_IDS = ` ${ADMIN_OID} , ,${OTHER_OID}, `;
    expect(getAdminObjectIds()).toEqual([ADMIN_OID.toLowerCase(), OTHER_OID.toLowerCase()]);
  });

  it("an unset ADMIN_OBJECT_IDS denies every oid (fail closed, not fail open to \"everyone is admin\")", () => {
    delete (process.env as Record<string, string | undefined>).ADMIN_OBJECT_IDS;
    expect(getAdminObjectIds()).toEqual([]);
    expect(isAdminOid(ADMIN_OID)).toBe(false);
  });
});

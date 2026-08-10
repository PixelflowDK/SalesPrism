import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// ADR-003 introduces a real behavior change in user-service.ts beyond the
// mechanical rename: `UserAccount.canonicalUserId` is now nullable
// (`CreateUser`'s "invite by email" pre-provisioning can't know a real oid
// before the invitee's first login), and `EnsureUserOnLogin` gained a
// reconciliation step that adopts a matching pending invite instead of
// creating a duplicate directory entry. This file is new — there was no
// user-service.test.ts before this task.
// ---------------------------------------------------------------------------
const queryMock = vi.fn();
const itemMock = vi.fn();
const itemsCreateMock = vi.fn();
const itemsUpsertMock = vi.fn();

vi.mock("@/features/common/services/cosmos", () => ({
  ConfigContainer: () => ({
    items: { query: queryMock, create: itemsCreateMock, upsert: itemsUpsertMock },
    item: itemMock,
  }),
}));

vi.mock("@/features/common/services/safe-logger", () => ({
  safeLog: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock("@/features/common/util", () => ({
  uniqueId: () => "fixed-unique-id",
}));

vi.mock("@/features/theme/tenant-resolver", () => ({
  getCurrentTenantSlug: () => Promise.resolve(TENANT),
}));

vi.mock("@/features/theme/tenant-theme", () => ({
  GetTenantTheme: () =>
    Promise.resolve({ status: "OK", response: { authMethod: "entra-sso" } }),
}));

const getCurrentUserMock = vi.fn();
const currentUserIdMock = vi.fn();
vi.mock("@/features/auth-page/helpers", () => ({
  getCurrentUser: () => getCurrentUserMock(),
  currentUserId: () => currentUserIdMock(),
}));

import { CreateUser, EnsureUserOnLogin, UserAccount, USER_ACCOUNT_ATTRIBUTE } from "./user-service";

const TENANT = "dsv";
const CANONICAL_ID = "d4b1b55b-6c92-4419-9a08-956e975dce86:7d37f13b-d198-4421-81c6-f0f9076049c7";
const SELLER_EMAIL = "seller@example.com";

const makeTypedQueryMock = (resultsByEmailOrId: { byCanonicalId?: UserAccount[]; pendingByEmail?: UserAccount[] }) =>
  vi.fn((querySpec: { query: string; parameters: { name: string; value: unknown }[] }) => {
    const isPendingInviteQuery = querySpec.query.includes("IS_NULL(r.canonicalUserId)");
    const resources = isPendingInviteQuery
      ? resultsByEmailOrId.pendingByEmail ?? []
      : resultsByEmailOrId.byCanonicalId ?? [];
    return { fetchAll: async () => ({ resources }) };
  });

const pendingInvite: UserAccount = {
  id: "user-dsv-pending-invite",
  type: USER_ACCOUNT_ATTRIBUTE,
  userId: TENANT,
  tenantSlug: TENANT,
  canonicalUserId: null,
  displayName: "Pre-provisioned Name",
  email: SELLER_EMAIL,
  role: "admin", // admin-set role — must survive reconciliation
  authMethod: "entra-sso",
  tags: { team: "Nordics" },
  createdAt: "2026-01-01T00:00:00.000Z",
  lastLoginAt: null,
  status: "active",
  onboardingCompletedAt: null,
};

describe("EnsureUserOnLogin — pending-invite reconciliation (ADR-003)", () => {
  beforeEach(() => {
    queryMock.mockReset();
    itemMock.mockReset();
    itemsCreateMock.mockReset();
    itemsUpsertMock.mockReset();
    getCurrentUserMock.mockReset();
    currentUserIdMock.mockReset();

    getCurrentUserMock.mockResolvedValue({
      name: "Real Seller Name",
      email: SELLER_EMAIL,
      isAdmin: false,
    });
    currentUserIdMock.mockResolvedValue(CANONICAL_ID);
    itemsUpsertMock.mockImplementation(async (doc: unknown) => ({ resource: doc }));
    itemsCreateMock.mockImplementation(async (doc: unknown) => ({ resource: doc }));
  });

  it("adopts a matching pending invite (by email) instead of creating a duplicate account, preserving admin-set role/tags and setting the real canonicalUserId", async () => {
    queryMock.mockImplementation(
      makeTypedQueryMock({ byCanonicalId: [], pendingByEmail: [pendingInvite] })
    );

    await EnsureUserOnLogin();

    expect(itemsCreateMock).not.toHaveBeenCalled();
    expect(itemsUpsertMock).toHaveBeenCalledTimes(1);
    const [upserted] = itemsUpsertMock.mock.calls[0];

    expect(upserted.id).toBe(pendingInvite.id); // same doc, not a new one
    expect(upserted.canonicalUserId).toBe(CANONICAL_ID); // linked to the real, verified id
    expect(upserted.role).toBe("admin"); // admin-set role preserved
    expect(upserted.tags).toEqual({ team: "Nordics" }); // admin-set tags preserved
    expect(upserted.displayName).toBe("Real Seller Name"); // synced from IdP
  });

  it("seeds a brand-new account when there is neither an existing canonicalUserId match NOR a pending invite by email", async () => {
    queryMock.mockImplementation(makeTypedQueryMock({ byCanonicalId: [], pendingByEmail: [] }));

    await EnsureUserOnLogin();

    expect(itemsUpsertMock).not.toHaveBeenCalled();
    expect(itemsCreateMock).toHaveBeenCalledTimes(1);
    const [created] = itemsCreateMock.mock.calls[0];
    expect(created.canonicalUserId).toBe(CANONICAL_ID);
  });

  it("does nothing further once an account already has this canonicalUserId (normal repeat login), never touching the pending-invite path", async () => {
    const existingLinkedAccount: UserAccount = {
      ...pendingInvite,
      id: "user-dsv-already-linked",
      canonicalUserId: CANONICAL_ID,
      lastLoginAt: "2020-01-01T00:00:00.000Z", // old enough to pass the throttle
    };
    queryMock.mockImplementation(
      makeTypedQueryMock({ byCanonicalId: [existingLinkedAccount], pendingByEmail: [pendingInvite] })
    );

    await EnsureUserOnLogin();

    expect(itemsCreateMock).not.toHaveBeenCalled();
    expect(itemsUpsertMock).toHaveBeenCalledTimes(1);
    const [upserted] = itemsUpsertMock.mock.calls[0];
    expect(upserted.id).toBe("user-dsv-already-linked"); // not the pending invite doc
  });
});

describe("CreateUser — duplicate-email prevention (ADR-003: doc id is no longer email-derived)", () => {
  beforeEach(() => {
    queryMock.mockReset();
    itemsCreateMock.mockReset();
  });

  it("rejects creating a second account for an email that already has a directory entry (pending or linked)", async () => {
    queryMock.mockReturnValue({ fetchAll: async () => ({ resources: [pendingInvite] }) });

    const result = await CreateUser({
      displayName: "Duplicate",
      email: SELLER_EMAIL,
      role: "user",
      tags: {},
    });

    expect(result.status).toBe("ERROR");
    expect(itemsCreateMock).not.toHaveBeenCalled();
  });

  it("creates a new pending-invite account (canonicalUserId: null) for a genuinely new email", async () => {
    queryMock.mockReturnValue({ fetchAll: async () => ({ resources: [] }) });
    itemsCreateMock.mockImplementation(async (doc: unknown) => ({ resource: doc }));

    const result = await CreateUser({
      displayName: "New Invitee",
      email: "new.invitee@example.com",
      role: "user",
      tags: {},
    });

    expect(result.status).toBe("OK");
    const [created] = itemsCreateMock.mock.calls[0];
    expect(created.canonicalUserId).toBeNull();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { CustomerContact } from "./models";

// ---------------------------------------------------------------------------
// Module-boundary mocks — no real Cosmos/network calls. `ConfigContainer()`
// is replaced with a stub whose `.items.query`/`.item`/`.items.create`/
// `.items.upsert` we control per-test so we can both (a) drive the pure
// query-building/merge logic under test and (b) INSPECT exactly what query
// spec + partition key each exported function sent to Cosmos — which is the
// whole point of the isolation tests below (the F-03 per-seller isolation
// guarantee: every query MUST include both tenantSlug and ownerId).
// ---------------------------------------------------------------------------
const queryMock = vi.fn();
const itemReadMock = vi.fn();
const itemMock = vi.fn(() => ({ read: itemReadMock }));
const itemsCreateMock = vi.fn();
const itemsUpsertMock = vi.fn();

vi.mock("@/features/common/services/cosmos", () => ({
  ConfigContainer: () => ({
    items: {
      query: queryMock,
      create: itemsCreateMock,
      upsert: itemsUpsertMock,
    },
    item: itemMock,
  }),
}));

vi.mock("@/features/common/services/safe-logger", () => ({
  safeLog: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock("@/features/common/util", () => ({
  uniqueId: () => "fixed-unique-id",
}));

import {
  CreateCustomerEntity,
  FindCustomerEntitiesForOwner,
  FindCustomerEntityById,
  FindCustomerEntityByName,
  mergeContacts,
  normalizeCustomerName,
  UpdateCustomerEntityInteraction,
} from "./customer-entity-service";

describe("normalizeCustomerName", () => {
  it("trims and lowercases", () => {
    expect(normalizeCustomerName("  DSV Logistics  ")).toBe("dsv logistics");
  });

  it("is idempotent", () => {
    const once = normalizeCustomerName("Acme Corp");
    expect(normalizeCustomerName(once)).toBe(once);
  });
});

const makeContact = (overrides: Partial<CustomerContact> = {}): CustomerContact => ({
  name: "Jane Doe",
  title: "CFO",
  personaType: null,
  primaryValueArea: null,
  secondaryValueArea: null,
  knownTriggers: [],
  communicationTips: [],
  suggestedQuestions: [],
  notes: "",
  ...overrides,
});

describe("mergeContacts", () => {
  it("adds a new contact not present in the existing list", () => {
    const existing: CustomerContact[] = [];
    const incoming = [makeContact({ name: "New Person" })];
    const result = mergeContacts(existing, incoming);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("New Person");
  });

  it("merges by case-insensitive/trimmed name match, preferring newly-classified fields", () => {
    const existing = [
      makeContact({
        name: "Jane Doe",
        title: "Old Title",
        knownTriggers: ["price"],
      }),
    ];
    const incoming = [
      makeContact({
        name: "  jane doe  ",
        title: "New Title",
        knownTriggers: ["timeline"],
      }),
    ];
    const result = mergeContacts(existing, incoming);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("New Title");
    // union of triggers, deduped
    expect(result[0].knownTriggers.sort()).toEqual(["price", "timeline"]);
  });

  it("keeps the existing title/notes as fallback when the incoming value is falsy/empty", () => {
    const existing = [makeContact({ title: "CFO", notes: "prior notes" })];
    const incoming = [makeContact({ title: "", notes: "" })];
    const result = mergeContacts(existing, incoming);
    expect(result[0].title).toBe("CFO");
    expect(result[0].notes).toBe("prior notes");
  });

  it("prefers incoming communicationTips/suggestedQuestions only when non-empty", () => {
    const existing = [
      makeContact({
        communicationTips: ["be direct"],
        suggestedQuestions: ["what's your budget?"],
      }),
    ];
    const incoming = [makeContact({ communicationTips: [], suggestedQuestions: [] })];
    const result = mergeContacts(existing, incoming);
    expect(result[0].communicationTips).toEqual(["be direct"]);
    expect(result[0].suggestedQuestions).toEqual(["what's your budget?"]);
  });

  it("keeps unrelated existing contacts untouched", () => {
    const existing = [makeContact({ name: "Alice" }), makeContact({ name: "Bob" })];
    const incoming = [makeContact({ name: "Carol" })];
    const result = mergeContacts(existing, incoming);
    expect(result.map((c) => c.name).sort()).toEqual(["Alice", "Bob", "Carol"]);
  });
});

// ---------------------------------------------------------------------------
// Isolation tests — F-03 per-seller isolation guarantee (models.ts module
// doc: "omitting ownerId from a query filter is a cross-user data
// leakage bug"). Every exported Cosmos-backed query function is parametrized
// here and asserted to include BOTH tenantSlug and ownerId in what it
// sends to Cosmos.
// ---------------------------------------------------------------------------
describe("customer-entity-service isolation: every query scopes by tenantSlug AND ownerId", () => {
  beforeEach(() => {
    queryMock.mockReset();
    itemReadMock.mockReset();
    itemMock.mockClear();
    itemsCreateMock.mockReset();
    itemsUpsertMock.mockReset();
    queryMock.mockReturnValue({ fetchAll: async () => ({ resources: [] }) });
  });

  const TENANT = "dsv";
  const OWNER = "hashed-owner-abc";

  it("FindCustomerEntitiesForOwner: query params include tenantSlug and ownerId, partitionKey is tenantSlug", async () => {
    await FindCustomerEntitiesForOwner(TENANT, OWNER);

    expect(queryMock).toHaveBeenCalledTimes(1);
    const [querySpec, options] = queryMock.mock.calls[0];
    const paramNames = querySpec.parameters.map((p: { name: string }) => p.name);
    const paramValues = Object.fromEntries(
      querySpec.parameters.map((p: { name: string; value: unknown }) => [p.name, p.value])
    );

    expect(paramNames).toEqual(
      expect.arrayContaining(["@tenantSlug", "@ownerId"])
    );
    expect(paramValues["@tenantSlug"]).toBe(TENANT);
    expect(paramValues["@ownerId"]).toBe(OWNER);
    expect(options).toEqual({ partitionKey: TENANT });
    // SECURITY: the raw SQL text itself must reference both filter columns —
    // a param that's defined but never used in `query` would not actually
    // scope anything.
    expect(querySpec.query).toMatch(/r\.tenantSlug=@tenantSlug/);
    expect(querySpec.query).toMatch(/r\.ownerId=@ownerId/);
  });

  it("FindCustomerEntityByName: query params include tenantSlug and ownerId", async () => {
    await FindCustomerEntityByName(TENANT, OWNER, "Acme");

    const [querySpec] = queryMock.mock.calls[0];
    const paramValues = Object.fromEntries(
      querySpec.parameters.map((p: { name: string; value: unknown }) => [p.name, p.value])
    );
    expect(paramValues["@tenantSlug"]).toBe(TENANT);
    expect(paramValues["@ownerId"]).toBe(OWNER);
    expect(querySpec.query).toMatch(/r\.ownerId=@ownerId/);
  });

  it("FindCustomerEntityById: re-checks tenantSlug AND ownerId on the resource even though the read is already partition-scoped", async () => {
    itemReadMock.mockResolvedValue({
      resource: {
        id: "customer-1",
        tenantSlug: TENANT,
        ownerId: "SOMEONE-ELSE",
        type: "SALES_COACH_CUSTOMER_ENTITY",
      },
    });

    const result = await FindCustomerEntityById(TENANT, OWNER, "customer-1");

    // SECURITY: a point-read by id, scoped only by the Cosmos partition key
    // (tenantSlug), is NOT enough — a different seller in the SAME tenant
    // could otherwise read another seller's customer by guessing/enumerating
    // ids. The ownerId mismatch above must produce NOT_FOUND, not the
    // resource.
    expect(result.status).toBe("NOT_FOUND");
    expect(itemMock).toHaveBeenCalledWith("customer-1", TENANT);
  });

  it("FindCustomerEntityById: returns the resource only when both tenantSlug and ownerId match", async () => {
    const now = new Date().toISOString();
    itemReadMock.mockResolvedValue({
      resource: {
        id: "customer-1",
        type: "SALES_COACH_CUSTOMER_ENTITY",
        userId: TENANT,
        tenantSlug: TENANT,
        ownerId: OWNER,
        customerName: "Acme",
        customerNameNormalized: "acme",
        contacts: [],
        knownChallenges: [],
        lastInteraction: now,
        meetingHistory: [],
        valueAreas: [],
        createdAt: now,
        updatedAt: now,
      },
    });

    const result = await FindCustomerEntityById(TENANT, OWNER, "customer-1");
    expect(result.status).toBe("OK");
  });

  it("CreateCustomerEntity: persists the given tenantSlug and ownerId on the created document", async () => {
    itemsCreateMock.mockImplementation(async (doc: unknown) => ({ resource: doc }));

    const result = await CreateCustomerEntity({
      tenantSlug: TENANT,
      ownerId: OWNER,
      customerName: "Acme",
    });

    expect(result.status).toBe("OK");
    const [createdDoc] = itemsCreateMock.mock.calls[0];
    expect(createdDoc.tenantSlug).toBe(TENANT);
    expect(createdDoc.ownerId).toBe(OWNER);
  });

  it("UpdateCustomerEntityInteraction: refuses to update when the owner does not match (via FindCustomerEntityById's re-check)", async () => {
    itemReadMock.mockResolvedValue({
      resource: {
        id: "customer-1",
        tenantSlug: TENANT,
        ownerId: "SOMEONE-ELSE",
        type: "SALES_COACH_CUSTOMER_ENTITY",
      },
    });

    const result = await UpdateCustomerEntityInteraction(TENANT, OWNER, "customer-1", {
      newChallenges: ["new challenge"],
    });

    expect(result.status).toBe("NOT_FOUND");
    expect(itemsUpsertMock).not.toHaveBeenCalled();
  });
});

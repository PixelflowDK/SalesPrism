import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Same module-boundary mock pattern as customer-entity-service.test.ts —
// this file exists specifically to close the ADR-003 test-coverage gap for
// "cross-user isolation: user A's canonical id cannot read user B's ...
// briefs" (meeting-brief-service.ts had no dedicated test file before).
// ---------------------------------------------------------------------------
const queryMock = vi.fn();
const itemReadMock = vi.fn();
const itemMock = vi.fn(() => ({ read: itemReadMock }));
const itemsCreateMock = vi.fn();

vi.mock("@/features/common/services/cosmos", () => ({
  ConfigContainer: () => ({
    items: { query: queryMock, create: itemsCreateMock },
    item: itemMock,
  }),
}));

vi.mock("@/features/common/services/safe-logger", () => ({
  safeLog: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock("@/features/common/util", () => ({
  uniqueId: () => "fixed-unique-id",
}));

const linkMeetingBriefToCustomerMock = vi.fn();
vi.mock("./customer-entity-service", () => ({
  LinkMeetingBriefToCustomer: (...args: unknown[]) => linkMeetingBriefToCustomerMock(...args),
}));

import { CreateMeetingBrief, FindMeetingBriefById, FindMeetingBriefsForOwner } from "./meeting-brief-service";
import { MeetingBrief } from "./models";

const TENANT = "dsv";
const OWNER_A = "d4b1b55b-6c92-4419-9a08-956e975dce86:7d37f13b-d198-4421-81c6-f0f9076049c7";
const OWNER_B = "11111111-2222-3333-4444-555555555555:99999999-8888-7777-6666-555555555555";

const makeBrief = (): MeetingBrief => ({
  customerName: "Acme",
  meetingTopic: "Kickoff",
  openingQuestions: ["What does success look like?", "Who else is involved?"],
  valueAreaThemes: [],
  discoveryQuestionsByPersona: [],
  framing: { type: "burning-ambition", narrative: "Growth." },
  nextSteps: [],
});

describe("meeting-brief-service — cross-user isolation (ADR-003)", () => {
  beforeEach(() => {
    queryMock.mockReset();
    itemReadMock.mockReset();
    itemMock.mockClear();
    itemsCreateMock.mockReset();
    linkMeetingBriefToCustomerMock.mockReset();
    queryMock.mockReturnValue({ fetchAll: async () => ({ resources: [] }) });
  });

  it("FindMeetingBriefById: re-checks tenantSlug AND ownerId on the resource, so seller B (OWNER_B) cannot read seller A's (OWNER_A) brief by guessing its id", async () => {
    itemReadMock.mockResolvedValue({
      resource: {
        id: "brief-1",
        type: "SALES_COACH_MEETING_BRIEF",
        userId: TENANT,
        tenantSlug: TENANT,
        ownerId: OWNER_A,
        chatThreadId: "thread-1",
        customerEntityId: null,
        brief: makeBrief(),
        createdAt: new Date().toISOString(),
      },
    });

    const resultForOwner = await FindMeetingBriefById(TENANT, OWNER_A, "brief-1");
    expect(resultForOwner.status).toBe("OK");

    const resultForOtherUser = await FindMeetingBriefById(TENANT, OWNER_B, "brief-1");
    expect(resultForOtherUser.status).toBe("NOT_FOUND");
    // The point-read itself is only partition (tenantSlug) scoped — the
    // in-code ownerId re-check above is the only thing standing between
    // OWNER_B and OWNER_A's brief content.
    expect(itemMock).toHaveBeenCalledWith("brief-1", TENANT);
  });

  it("FindMeetingBriefsForOwner: query is scoped by BOTH tenantSlug and ownerId — never tenantSlug alone", async () => {
    await FindMeetingBriefsForOwner(TENANT, OWNER_A);

    expect(queryMock).toHaveBeenCalledTimes(1);
    const [querySpec, options] = queryMock.mock.calls[0];
    const paramValues = Object.fromEntries(
      querySpec.parameters.map((p: { name: string; value: unknown }) => [p.name, p.value])
    );

    expect(paramValues["@tenantSlug"]).toBe(TENANT);
    expect(paramValues["@ownerId"]).toBe(OWNER_A);
    expect(options).toEqual({ partitionKey: TENANT });
    expect(querySpec.query).toMatch(/r\.ownerId=@ownerId/);
  });

  it("CreateMeetingBrief: persists the given ownerId on the created document — never derived from anything client-suppliable", async () => {
    itemsCreateMock.mockImplementation(async (doc: unknown) => ({ resource: doc }));
    linkMeetingBriefToCustomerMock.mockResolvedValue({ status: "OK" });

    const result = await CreateMeetingBrief({
      tenantSlug: TENANT,
      ownerId: OWNER_A,
      chatThreadId: "thread-1",
      customerEntityId: null,
      brief: makeBrief(),
    });

    expect(result.status).toBe("OK");
    const [createdDoc] = itemsCreateMock.mock.calls[0];
    expect(createdDoc.ownerId).toBe(OWNER_A);
    expect(createdDoc.tenantSlug).toBe(TENANT);
    expect(linkMeetingBriefToCustomerMock).toHaveBeenCalledWith(
      expect.objectContaining({ tenantSlug: TENANT, ownerId: OWNER_A })
    );
  });
});

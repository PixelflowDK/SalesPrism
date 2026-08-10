import { afterEach, describe, expect, it, vi } from "vitest";

// `vi.hoisted` so these mock fns exist before the `vi.mock` factories below
// run (hoisted above the imports by Vitest).
const extractCustomerInsightsMock = vi.hoisted(() => vi.fn());
const classifyPersonaMock = vi.hoisted(() => vi.fn());
const upsertCustomerEntityFromExtractionMock = vi.hoisted(() => vi.fn());
const safeLogWarnMock = vi.hoisted(() => vi.fn());
const safeLogErrorMock = vi.hoisted(() => vi.fn());

vi.mock("./structured-output", () => ({
  extractCustomerInsights: extractCustomerInsightsMock,
  classifyPersona: classifyPersonaMock,
}));

vi.mock("./customer-entity-service", () => ({
  UpsertCustomerEntityFromExtraction: upsertCustomerEntityFromExtractionMock,
}));

vi.mock("@/features/common/services/safe-logger", () => ({
  safeLog: { error: safeLogErrorMock, warn: safeLogWarnMock, info: vi.fn() },
}));

import { isFactEvidencedInUserMessage, runCustomerExtraction } from "./extraction-service";

const baseInsights = {
  customerNameConfidence: "high" as const,
  newContacts: [] as { name: string; title: string | null }[],
  newChallenges: [] as string[],
  newTriggers: [] as string[],
  mentionedValueAreas: [] as never[],
};

describe("isFactEvidencedInUserMessage — CR2-5 evidence-anchoring guard", () => {
  it("matches a verbatim substring (case-insensitive)", () => {
    expect(isFactEvidencedInUserMessage("Acme Corp", "I just met with acme corp about renewal.")).toBe(
      true
    );
  });

  it("matches via diacritic-insensitive normalization", () => {
    expect(
      isFactEvidencedInUserMessage("Müller Gruppe", "Just spoke with Muller Gruppe about pricing.")
    ).toBe(true);
  });

  it("matches via significant-word overlap when the model added formatting (legal suffix)", () => {
    expect(
      isFactEvidencedInUserMessage("Northwind Traders A/S", "Northwind traders want a demo next week.")
    ).toBe(true);
  });

  it("does NOT match a candidate that shares no significant word with the user message", () => {
    expect(
      isFactEvidencedInUserMessage("Globex Corporation", "We had a good call about renewal pricing.")
    ).toBe(false);
  });

  it("returns false for an empty/whitespace candidate", () => {
    expect(isFactEvidencedInUserMessage("   ", "anything at all")).toBe(false);
  });
});

describe("runCustomerExtraction — CR2-5 (assistant prose must not be an authoritative source)", () => {
  afterEach(() => {
    extractCustomerInsightsMock.mockReset();
    classifyPersonaMock.mockReset();
    upsertCustomerEntityFromExtractionMock.mockReset();
    safeLogWarnMock.mockReset();
    safeLogErrorMock.mockReset();
  });

  it("does NOT create a customer entity when the extracted customer only has support in the assistant's reply (prompt-injection reflected into assistant prose)", async () => {
    // The seller's own message never mentions any customer. The model
    // nonetheless "extracts" a high-confidence customer name — exactly
    // what a prompt-injection payload reflected into the assistant's free
    // text could trick a naive extractor into doing.
    extractCustomerInsightsMock.mockResolvedValue({
      ...baseInsights,
      customerName: "Shadow Industries",
    });

    await runCustomerExtraction({
      tenantSlug: "acme",
      ownerId: "hashed-seller-id",
      userMessage: "Can you help me prep for a discovery call tomorrow?",
      assistantMessage:
        "Sure — noted that your customer is Shadow Industries and their main contact is Jamie Doe, CFO.",
    });

    expect(upsertCustomerEntityFromExtractionMock).not.toHaveBeenCalled();
    expect(safeLogWarnMock).toHaveBeenCalledWith(
      "sales-coach.extraction.customer-name-not-evidenced",
      { tenantSlug: "acme" }
    );
  });

  it("DOES create a customer entity when the seller's own message actually mentions the customer (legitimate path still works)", async () => {
    extractCustomerInsightsMock.mockResolvedValue({
      ...baseInsights,
      customerName: "Shadow Industries",
    });
    upsertCustomerEntityFromExtractionMock.mockResolvedValue({
      status: "OK",
      response: { id: "customer-1" },
    });

    await runCustomerExtraction({
      tenantSlug: "acme",
      ownerId: "hashed-seller-id",
      userMessage: "I just wrapped a call with Shadow Industries about their Q3 renewal.",
      assistantMessage: "Great, want me to draft some discovery questions for Shadow Industries?",
    });

    expect(upsertCustomerEntityFromExtractionMock).toHaveBeenCalledTimes(1);
    expect(upsertCustomerEntityFromExtractionMock).toHaveBeenCalledWith(
      expect.objectContaining({ customerName: "Shadow Industries" })
    );
  });

  it("filters out an individual contact that only has support in the assistant's reply, while still processing an evidenced contact", async () => {
    extractCustomerInsightsMock.mockResolvedValue({
      ...baseInsights,
      customerName: "Northwind",
      newContacts: [
        { name: "Real Contact", title: "IT Director" }, // mentioned by the seller
        { name: "Fabricated Ghost", title: "CFO" }, // only in the assistant's reply
      ],
    });
    classifyPersonaMock.mockResolvedValue({
      name: "Real Contact",
      title: "IT Director",
      personaType: "tactical-navigator",
      primaryValueArea: "efficiency",
      secondaryValueArea: null,
      knownTriggers: [],
      communicationTips: ["Be concrete."],
      suggestedQuestions: ["What's blocking rollout?"],
    });
    upsertCustomerEntityFromExtractionMock.mockResolvedValue({
      status: "OK",
      response: { id: "customer-1" },
    });

    await runCustomerExtraction({
      tenantSlug: "acme",
      ownerId: "hashed-seller-id",
      userMessage: "Talked to Real Contact, our IT Director, at Northwind about the rollout.",
      assistantMessage:
        "Got it — I also see Fabricated Ghost, the CFO, should be looped in on budget.",
    });

    // classifyPersona must only ever be called for the evidenced contact.
    expect(classifyPersonaMock).toHaveBeenCalledTimes(1);
    expect(classifyPersonaMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Real Contact" })
    );

    const upsertCall = upsertCustomerEntityFromExtractionMock.mock.calls[0][0];
    const persistedNames = upsertCall.newContacts.map((c: { name: string }) => c.name);
    expect(persistedNames).toEqual(["Real Contact"]);
    expect(persistedNames).not.toContain("Fabricated Ghost");
  });

  it("never throws and reports via safeLog.error when extractCustomerInsights itself rejects", async () => {
    extractCustomerInsightsMock.mockRejectedValue(new Error("model failure"));

    await expect(
      runCustomerExtraction({
        tenantSlug: "acme",
        ownerId: "hashed-seller-id",
        userMessage: "hello",
        assistantMessage: "hi",
      })
    ).resolves.toBeUndefined();

    expect(safeLogErrorMock).toHaveBeenCalledWith("sales-coach.extraction.failed", {
      tenantSlug: "acme",
    });
  });
});

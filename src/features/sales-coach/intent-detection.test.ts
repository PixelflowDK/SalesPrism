import { describe, expect, it } from "vitest";
import { detectCoachingContext, findMentionedCustomerName } from "./intent-detection";

describe("detectCoachingContext", () => {
  it("returns null for an empty/whitespace-only message", () => {
    expect(detectCoachingContext("")).toBeNull();
    expect(detectCoachingContext("   ")).toBeNull();
  });

  it("returns null for neutral phrasing with no coaching intent", () => {
    expect(detectCoachingContext("Hvad er klokken?")).toBeNull();
    expect(detectCoachingContext("What's the weather like today?")).toBeNull();
  });

  describe("meeting-prep — Danish", () => {
    it.each([
      "Kan du forberede mig til et møde?",
      "Jeg har brug for mødeforberedelse til DSV",
      "Forbered mig til kundemøde i morgen",
    ])("detects meeting-prep for: %s", (message) => {
      expect(detectCoachingContext(message)).toBe("meeting-prep");
    });
  });

  describe("meeting-prep — English", () => {
    it.each([
      "Can you prepare me for a meeting with Acme Corp?",
      "I need some meeting preparation",
      "help me prepare for tomorrow's call",
    ])("detects meeting-prep for: %s", (message) => {
      expect(detectCoachingContext(message)).toBe("meeting-prep");
    });
  });

  describe("conversation-coaching — Danish", () => {
    it.each([
      "Jeg havde et møde med kunden i går",
      "Kunden virkede skeptisk over prisen",
      "Giv mig feedback på hvordan det gik",
      "Hvordan gik det møde jeg lige havde?",
    ])("detects conversation-coaching for: %s", (message) => {
      expect(detectCoachingContext(message)).toBe("conversation-coaching");
    });
  });

  describe("conversation-coaching — English", () => {
    it.each([
      "I had a meeting with the customer yesterday",
      "Give me feedback on that call",
      "How did that go, do you think?",
    ])("detects conversation-coaching for: %s", (message) => {
      expect(detectCoachingContext(message)).toBe("conversation-coaching");
    });
  });

  it("prefers meeting-prep over coaching when a message matches both patterns", () => {
    // Matches both a meeting-prep pattern ("forbered mig ... møde") and a
    // coaching pattern ("kunden ... sagde") — per the doc-comment, meeting
    // prep must win.
    const message = "forbered mig til møde — kunden var utilfreds sidst";
    expect(detectCoachingContext(message)).toBe("meeting-prep");
  });
});

describe("findMentionedCustomerName", () => {
  it("returns null when no known name is mentioned", () => {
    expect(
      findMentionedCustomerName("Just a generic message", ["Acme", "DSV"])
    ).toBeNull();
  });

  it("returns null when the known-names list is empty", () => {
    expect(findMentionedCustomerName("Talking about DSV today", [])).toBeNull();
  });

  it("finds a case-insensitive substring match", () => {
    expect(
      findMentionedCustomerName("I met with dsv logistics yesterday", [
        "DSV Logistics",
      ])
    ).toBe("DSV Logistics");
  });

  it("prefers the longest matching name when multiple known names could match", () => {
    expect(
      findMentionedCustomerName("Following up with DSV Logistics", [
        "DSV",
        "DSV Logistics",
      ])
    ).toBe("DSV Logistics");
  });

  it("ignores blank entries in the known-names list", () => {
    expect(
      findMentionedCustomerName("Following up with DSV", ["", "   ", "DSV"])
    ).toBe("DSV");
  });
});

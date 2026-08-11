import { describe, expect, it } from "vitest";
import {
  ActiveModuleView,
  buildSalesCoachSystemPrompt,
  mergeModuleConfigEntries,
  SalesCoachPersonaContext,
} from "./context-injection";
import { ModuleConfigEntry } from "./models";

const module1: ActiveModuleView = {
  key: "module-01",
  name: "1st Position vs 2nd Position Model",
  essence: "1st vs 2nd position essence text.",
  order: 1,
  customName: null,
};

const module2: ActiveModuleView = {
  key: "module-04",
  name: "Value Conversation Model",
  essence: "Value conversation essence text.",
  order: 2,
  customName: "Custom Value Model Name",
};

const basePersona: SalesCoachPersonaContext = {
  assistantName: "Coach",
  coachingContext: null,
  customerContext: null,
};

describe("buildSalesCoachSystemPrompt", () => {
  it("injects active modules by name", () => {
    const prompt = buildSalesCoachSystemPrompt([module1], basePersona);
    expect(prompt).toMatch(/1st Position vs 2nd Position Model/);
    expect(prompt).toMatch(/1st vs 2nd position essence text\./);
  });

  it("uses customName instead of the registry name when set", () => {
    const prompt = buildSalesCoachSystemPrompt([module2], basePersona);
    expect(prompt).toMatch(/Custom Value Model Name/);
    expect(prompt).not.toMatch(/- Value Conversation Model:/);
  });

  it("omits modules that are not in the active list", () => {
    const prompt = buildSalesCoachSystemPrompt([module1], basePersona);
    expect(prompt).not.toMatch(/Value Conversation Model/);
    expect(prompt).not.toMatch(/Custom Value Model Name/);
  });

  it("produces no module section when no modules are active", () => {
    const prompt = buildSalesCoachSystemPrompt([], basePersona);
    expect(prompt).not.toMatch(/Aktiverede Sales Coach modeller/);
  });

  it("renders modules in the order of the input array (sorting by `order` is the caller's responsibility, e.g. GetActiveModules, not this pure builder)", () => {
    // Corrected after a first draft of this test wrongly assumed
    // buildSalesCoachSystemPrompt itself re-sorts by `.order` — reading the
    // implementation shows buildModuleSection just maps over whatever array
    // it's given, with no sort step. That's a reasonable design (the
    // Cosmos-backed GetActiveModules already sorts before calling this), so
    // this test now documents the real contract instead: the pure builder
    // trusts caller-provided ordering verbatim.
    const alreadySorted: ActiveModuleView[] = [module1, module2];
    const prompt = buildSalesCoachSystemPrompt(alreadySorted, basePersona);
    const idx1 = prompt.indexOf("1st Position vs 2nd Position Model");
    const idx2 = prompt.indexOf("Custom Value Model Name");
    expect(idx1).toBeGreaterThanOrEqual(0);
    expect(idx2).toBeGreaterThanOrEqual(0);
    expect(idx1).toBeLessThan(idx2);

    // Passing them in reverse order changes the render order too — proves
    // there's no internal sort happening.
    const reversed: ActiveModuleView[] = [module2, module1];
    const reversedPrompt = buildSalesCoachSystemPrompt(reversed, basePersona);
    const revIdx1 = reversedPrompt.indexOf("1st Position vs 2nd Position Model");
    const revIdx2 = reversedPrompt.indexOf("Custom Value Model Name");
    expect(revIdx2).toBeLessThan(revIdx1);
  });

  it("includes the meeting-prep guidance block when coachingContext is meeting-prep", () => {
    const prompt = buildSalesCoachSystemPrompt([module1], {
      ...basePersona,
      coachingContext: "meeting-prep",
    });
    expect(prompt).toMatch(/Mødeforberedelses-flow/);
    expect(prompt).not.toMatch(/Samtalecoaching/);
  });

  it("includes the conversation-coaching guidance block when coachingContext is conversation-coaching", () => {
    const prompt = buildSalesCoachSystemPrompt([module1], {
      ...basePersona,
      coachingContext: "conversation-coaching",
    });
    expect(prompt).toMatch(/Samtalecoaching/);
    expect(prompt).not.toMatch(/Mødeforberedelses-flow/);
  });

  it("includes neither guidance block when coachingContext is null", () => {
    const prompt = buildSalesCoachSystemPrompt([module1], basePersona);
    expect(prompt).not.toMatch(/Mødeforberedelses-flow/);
    expect(prompt).not.toMatch(/Samtalecoaching/);
  });

  it("includes the customer context section (persona) when customerContext is provided", () => {
    const prompt = buildSalesCoachSystemPrompt([module1], {
      ...basePersona,
      customerContext: {
        customerName: "DSV Logistics",
        knownChallenges: ["slow onboarding", "unclear pricing"],
        valueAreas: ["risk-governance"],
        contacts: [
          {
            name: "Jane Doe",
            title: "CFO",
            personaType: "strategic-guardian",
            primaryValueArea: "risk-governance",
          },
        ],
      },
    });
    expect(prompt).toMatch(/DSV Logistics/);
    expect(prompt).toMatch(/slow onboarding, unclear pricing/);
    expect(prompt).toMatch(/Jane Doe \(CFO\)/);
    expect(prompt).toMatch(/Risk & Governance/);
  });

  it("omits the customer context section when customerContext is null/undefined", () => {
    const prompt = buildSalesCoachSystemPrompt([module1], basePersona);
    expect(prompt).not.toMatch(/Kendt kunde-kontekst/);
  });
});

// W4 (`/admin/modules`) — the admin toggle's pure merge step.
describe("mergeModuleConfigEntries", () => {
  const existing: ModuleConfigEntry[] = [
    { key: "module-01", active: true, order: 1, customName: null, language: "da", contentOverride: null },
    { key: "module-02", active: true, order: 2, customName: "Custom name", language: "en", contentOverride: "abc" },
    { key: "module-03", active: false, order: 3, customName: null, language: "da", contentOverride: null },
  ];

  it("overwrites only active/order/customName from a matching patch entry", () => {
    const result = mergeModuleConfigEntries(existing, [
      { key: "module-01", active: false, order: 5, customName: "Renamed" },
    ]);

    const patched = result.find((m) => m.key === "module-01")!;
    expect(patched.active).toBe(false);
    expect(patched.order).toBe(5);
    expect(patched.customName).toBe("Renamed");
  });

  it("preserves language/contentOverride verbatim — the patch shape has no such fields", () => {
    const result = mergeModuleConfigEntries(existing, [
      { key: "module-02", active: false, order: 2, customName: "Custom name" },
    ]);

    const patched = result.find((m) => m.key === "module-02")!;
    expect(patched.language).toBe("en");
    expect(patched.contentOverride).toBe("abc");
  });

  it("leaves every existing entry with no matching patch entirely unchanged (a partial patch list never drops modules)", () => {
    const result = mergeModuleConfigEntries(existing, [
      { key: "module-01", active: false, order: 1, customName: null },
    ]);

    const untouched = result.find((m) => m.key === "module-03")!;
    expect(untouched).toEqual(existing[2]);
    expect(result).toHaveLength(existing.length);
  });

  it("returns existing entries unchanged, in original order, when patchEntries is empty", () => {
    const result = mergeModuleConfigEntries(existing, []);
    expect(result).toEqual(existing);
  });
});

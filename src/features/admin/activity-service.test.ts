import { describe, expect, it } from "vitest";
import { csvEscape } from "./activity-service";

// `csvEscape` is the only pure, side-effect-free helper exported (directly
// or via the sole-exception `export` add — see the doc-comment on the
// export in activity-service.ts) from the admin package's tag/CSV logic.
// `AddTagDimension` / `RenameTagDimension` / `DeleteTagDimension` in
// group-service.ts are exported but are async Cosmos I/O end-to-end (their
// rename/delete logic is inlined into the I/O function body, not split out
// into a separate pure helper) — see this file's sibling report for the
// note that they were left untested rather than restructured to extract a
// pure function, per this task's "don't restructure app code" constraint.
describe("csvEscape", () => {
  it("returns plain values unchanged", () => {
    expect(csvEscape("Alice")).toBe("Alice");
    expect(csvEscape(42)).toBe("42");
  });

  it("returns an empty string for null", () => {
    expect(csvEscape(null)).toBe("");
  });

  it("quotes a value containing a comma", () => {
    expect(csvEscape("Doe, Jane")).toBe('"Doe, Jane"');
  });

  it("quotes a value containing a double quote and escapes it by doubling", () => {
    expect(csvEscape('She said "hi"')).toBe('"She said ""hi"""');
  });

  it("quotes a value containing a newline", () => {
    expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
  });

  it("does not quote a value with none of comma/quote/newline", () => {
    expect(csvEscape("plain-value_123")).toBe("plain-value_123");
  });
});

// CR2-2 (HIGH) regression tests — CSV/spreadsheet formula injection.
// `displayName`/`email` are IdP-controlled (synced verbatim on every login,
// see user-service.ts's `EnsureUserOnLogin`), so a hostile profile value
// starting with `=`, `+`, `-`, or `@` must never reach the exported CSV
// unprefixed, or it becomes live formula execution when an admin opens the
// export.
describe("csvEscape — CR2-2 formula injection neutralization", () => {
  it.each([
    ["=", "=cmd|'/C calc'!A1", "'=cmd|'/C calc'!A1"],
    ["+", "+1+1", "'+1+1"],
    ["-", "-2+3+cmd|' /C calc'!A1", "'-2+3+cmd|' /C calc'!A1"],
    ["@", "@SUM(1+1)", "'@SUM(1+1)"],
  ])("prefixes a string cell starting with %s with a single quote", (_label, input, expected) => {
    expect(csvEscape(input)).toBe(expected);
  });

  it.each([
    ["leading space", " =cmd()", "' =cmd()"],
    ["leading tab", "\t=cmd()", "'\t=cmd()"],
    ["leading CR", "\r-cmd()", "'\r-cmd()"],
  ])("also prefixes when the dangerous char is preceded by %s", (_label, input, expected) => {
    expect(csvEscape(input)).toBe(expected);
  });

  it("still applies normal comma/quote/newline quoting on top of the formula prefix", () => {
    expect(csvEscape("=SUM(A1, B1)")).toBe('"\'=SUM(A1, B1)"');
  });

  it("does not touch a string cell where the dangerous character isn't the first one", () => {
    expect(csvEscape("Alice=Bob")).toBe("Alice=Bob");
  });

  it("leaves an all-whitespace string cell unprefixed (nothing to neutralize)", () => {
    expect(csvEscape("   ")).toBe("   ");
  });

  it("documents the chosen rule for numeric-typed cells: a JS `number` like -5 is never prefixed (server-computed counts, not user-authored input)", () => {
    expect(csvEscape(-5)).toBe("-5");
    expect(csvEscape(5)).toBe("5");
  });

  it("DOES prefix a string cell that merely looks numeric (e.g. a hostile displayName of literally \"-5\") — the rule is type-based, not value-based", () => {
    expect(csvEscape("-5")).toBe("'-5");
  });
});

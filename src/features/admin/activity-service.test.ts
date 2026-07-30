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

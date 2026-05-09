import { describe, expect, it } from "vitest";
import { createSafePreview, sanitizeSearchQuery } from "./searchSanitization";

describe("sanitizeSearchQuery", () => {
  it("normalizes whitespace, lowercases text, and extracts bounded tokens", () => {
    const query = sanitizeSearchQuery("  Sleep\nIssues\tAfter Medication Change  ");

    expect(query.raw).toBe("Sleep Issues After Medication Change");
    expect(query.normalized).toBe("sleep issues after medication change");
    expect(query.tokens).toEqual(["sleep", "issues", "after", "medication", "change"]);
  });

  it("drops one-character tokens and bounds token count", () => {
    const query = sanitizeSearchQuery("a bb cc dd ee ff gg hh ii jj kk ll mm nn oo pp");

    expect(query.tokens).toHaveLength(12);
    expect(query.tokens[0]).toBe("bb");
    expect(query.tokens.at(-1)).toBe("mm");
  });
});

describe("createSafePreview", () => {
  it("creates a nearby preview around the first matching token", () => {
    const query = sanitizeSearchQuery("sleep");
    const preview = createSafePreview(
      "The first part is unrelated. Later the client mentioned recurring sleep trouble after stress.",
      query,
      96
    );

    expect(preview).toContain("sleep trouble");
    expect(preview.length).toBeLessThanOrEqual(98);
  });

  it("uses a safe fallback for blank note bodies", () => {
    expect(createSafePreview("   ", sanitizeSearchQuery("anything"))).toBe("No body text.");
  });
});

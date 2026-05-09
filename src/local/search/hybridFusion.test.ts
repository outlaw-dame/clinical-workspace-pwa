import { describe, expect, it } from "vitest";
import { reciprocalRankFusion } from "./hybridFusion";

describe("reciprocalRankFusion", () => {
  it("combines ranked lists and boosts candidates present in multiple lists", () => {
    const results = reciprocalRankFusion(
      [
        [
          { id: "a", score: 10 },
          { id: "b", score: 8 }
        ],
        [
          { id: "b", score: 1 },
          { id: "c", score: 0.9 }
        ]
      ],
      3
    );

    expect(results.map((result) => result.id)).toEqual(["b", "a", "c"]);
    expect(results[0]?.score).toBeGreaterThan(results[1]?.score ?? 0);
  });

  it("applies deterministic tie-breaking by id", () => {
    const results = reciprocalRankFusion(
      [
        [
          { id: "b", score: 0 },
          { id: "a", score: 0 }
        ]
      ],
      2,
      0
    );

    expect(results.map((result) => result.id)).toEqual(["b", "a"]);
  });
});

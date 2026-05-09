import type { RankedSearchCandidate } from "./searchTypes";

const DEFAULT_K = 60;

export function reciprocalRankFusion(
  rankedLists: readonly RankedSearchCandidate[][],
  limit: number,
  k = DEFAULT_K
): RankedSearchCandidate[] {
  const scores = new Map<string, number>();

  for (const rankedList of rankedLists) {
    rankedList.forEach((candidate, index) => {
      const previousScore = scores.get(candidate.id) ?? 0;
      scores.set(candidate.id, previousScore + 1 / (k + index + 1));
    });
  }

  return Array.from(scores.entries())
    .map(([id, score]) => ({ id, score }))
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
    .slice(0, limit);
}

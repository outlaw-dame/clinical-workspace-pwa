import type { RankedSearchCandidate, SanitizedSearchQuery, SearchableSecureNote } from "./searchTypes";

export function createLexicalCandidates(
  notes: readonly SearchableSecureNote[],
  query: SanitizedSearchQuery,
  limit: number
): RankedSearchCandidate[] {
  return notes
    .map((note) => ({ id: note.id, score: scoreLexicalMatch(note, query) }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
    .slice(0, limit);
}

export function scoreLexicalMatch(note: SearchableSecureNote, query: SanitizedSearchQuery): number {
  const title = note.title.toLowerCase();
  const body = note.body.toLowerCase();
  let score = 0;

  for (const token of query.tokens) {
    if (title.includes(token)) score += 4;
    if (body.includes(token)) score += 1;
  }

  if (title.includes(query.normalized)) score += 6;
  if (body.includes(query.normalized)) score += 2;

  return score;
}

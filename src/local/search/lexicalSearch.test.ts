import { describe, expect, it } from "vitest";
import { createLexicalCandidates, scoreLexicalMatch } from "./lexicalSearch";
import { sanitizeSearchQuery } from "./searchSanitization";
import type { SearchableSecureNote } from "./searchTypes";

const notes: SearchableSecureNote[] = [
  {
    id: "note-body",
    title: "Medication review",
    body: "Client reported sleep disruption after stress increased.",
    updatedAt: "2026-05-01T00:00:00.000Z"
  },
  {
    id: "note-title",
    title: "Sleep plan",
    body: "Discussed evening routine and caffeine boundaries.",
    updatedAt: "2026-05-02T00:00:00.000Z"
  },
  {
    id: "note-unrelated",
    title: "Billing follow-up",
    body: "Confirm insurance paperwork.",
    updatedAt: "2026-05-03T00:00:00.000Z"
  }
];

describe("scoreLexicalMatch", () => {
  it("weights title matches more heavily than body matches", () => {
    const query = sanitizeSearchQuery("sleep");

    expect(scoreLexicalMatch(notes[1]!, query)).toBeGreaterThan(scoreLexicalMatch(notes[0]!, query));
  });

  it("returns zero when no tokens or phrase match", () => {
    expect(scoreLexicalMatch(notes[2]!, sanitizeSearchQuery("sleep"))).toBe(0);
  });
});

describe("createLexicalCandidates", () => {
  it("returns ranked positive matches only", () => {
    const candidates = createLexicalCandidates(notes, sanitizeSearchQuery("sleep"), 10);

    expect(candidates.map((candidate) => candidate.id)).toEqual(["note-title", "note-body"]);
    expect(candidates.every((candidate) => candidate.score > 0)).toBe(true);
  });

  it("applies the requested result limit", () => {
    const candidates = createLexicalCandidates(notes, sanitizeSearchQuery("sleep"), 1);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.id).toBe("note-title");
  });
});

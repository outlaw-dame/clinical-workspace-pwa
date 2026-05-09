import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SearchableSecureNote } from "./searchTypes";

const mocks = vi.hoisted(() => ({
  getLocalDb: vi.fn(),
  recordAuditEventSafely: vi.fn()
}));

vi.mock("../db/client", () => ({
  getLocalDb: mocks.getLocalDb
}));

vi.mock("../audit/auditRepository", () => ({
  recordAuditEventSafely: mocks.recordAuditEventSafely
}));

const notes: SearchableSecureNote[] = [
  {
    id: "sleep-note",
    title: "Sleep plan",
    body: "Client mentioned sleep disruption and stress.",
    updatedAt: "2026-05-01T00:00:00.000Z"
  },
  {
    id: "billing-note",
    title: "Billing follow-up",
    body: "Insurance paperwork reminder.",
    updatedAt: "2026-05-02T00:00:00.000Z"
  }
];

beforeEach(() => {
  mocks.getLocalDb.mockReset();
  mocks.recordAuditEventSafely.mockReset();
});

describe("searchSecureNotes", () => {
  it("does not touch the database for lexical-only searches", async () => {
    const { searchSecureNotes } = await import("./localSearchIndex");

    const results = await searchSecureNotes(notes, "sleep", {
      mode: "lexical",
      limit: 10
    });

    expect(results.map((result) => result.recordId)).toEqual(["sleep-note"]);
    expect(results[0]?.matchKind).toBe("lexical");
    expect(mocks.getLocalDb).not.toHaveBeenCalled();
    expect(mocks.recordAuditEventSafely).toHaveBeenCalledWith("local_search.executed", "local_search", undefined, {
      mode: "lexical",
      tokenCount: 1,
      resultCount: 1
    });
  });

  it("returns early for empty sanitized queries without audit or database access", async () => {
    const { searchSecureNotes } = await import("./localSearchIndex");

    await expect(searchSecureNotes(notes, " a ", { mode: "lexical" })).resolves.toEqual([]);
    expect(mocks.getLocalDb).not.toHaveBeenCalled();
    expect(mocks.recordAuditEventSafely).not.toHaveBeenCalled();
  });
});

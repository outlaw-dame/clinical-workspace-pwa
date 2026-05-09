import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LocalSearchRepository } from "./searchRepository";
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

describe("indexSecureNoteForSearch", () => {
  it("writes search chunks through the injected repository", async () => {
    const { indexSecureNoteForSearch } = await import("./localSearchIndex");
    const repository = createMockRepository();

    await indexSecureNoteForSearch(notes[0]!, repository);

    expect(repository.ensureSchema).toHaveBeenCalledOnce();
    expect(repository.upsertSearchChunk).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "sleep-note:0",
        recordId: "sleep-note",
        recordType: "secure_note",
        chunkIndex: 0,
        sourceUpdatedAt: "2026-05-01T00:00:00.000Z",
        embeddingModel: "deterministic-local-token-hash-v1",
        schemaVersion: 1
      })
    );
    expect(mocks.getLocalDb).not.toHaveBeenCalled();
  });
});

describe("repairSecureNoteSearchIndex", () => {
  it("uses repository snapshots to repair stale and removed chunks", async () => {
    const { repairSecureNoteSearchIndex } = await import("./localSearchIndex");
    const repository = createMockRepository({
      snapshots: [
        {
          record_id: "sleep-note",
          source_updated_at: "2026-04-01T00:00:00.000Z"
        },
        {
          record_id: "removed-note",
          source_updated_at: "2026-04-02T00:00:00.000Z"
        }
      ]
    });

    await repairSecureNoteSearchIndex([notes[0]!], repository);

    expect(repository.listActiveChunkSnapshots).toHaveBeenCalledWith("secure_note", 0);
    expect(repository.upsertSearchChunk).toHaveBeenCalledWith(expect.objectContaining({ recordId: "sleep-note" }));
    expect(repository.markRecordDeleted).toHaveBeenCalledWith("secure_note", "removed-note", expect.any(String));
    expect(mocks.getLocalDb).not.toHaveBeenCalled();
  });
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

  it("uses the injected repository for semantic searches", async () => {
    const { searchSecureNotes } = await import("./localSearchIndex");
    const repository = createMockRepository({
      semanticCandidates: [{ id: "sleep-note", score: 0.92 }]
    });

    const results = await searchSecureNotes(notes, "sleep", {
      mode: "semantic",
      limit: 5,
      repository
    });

    expect(repository.ensureSchema).toHaveBeenCalledOnce();
    expect(repository.findSemanticCandidates).toHaveBeenCalledWith(
      expect.objectContaining({
        recordType: "secure_note",
        embeddingModel: "deterministic-local-token-hash-v1",
        schemaVersion: 1,
        limit: 5
      })
    );
    expect(results.map((result) => result.recordId)).toEqual(["sleep-note"]);
    expect(results[0]?.matchKind).toBe("semantic");
    expect(mocks.getLocalDb).not.toHaveBeenCalled();
  });

  it("returns early for empty sanitized queries without audit or database access", async () => {
    const { searchSecureNotes } = await import("./localSearchIndex");

    await expect(searchSecureNotes(notes, " a ", { mode: "lexical" })).resolves.toEqual([]);
    expect(mocks.getLocalDb).not.toHaveBeenCalled();
    expect(mocks.recordAuditEventSafely).not.toHaveBeenCalled();
  });
});

type MockRepositoryOptions = {
  snapshots?: Awaited<ReturnType<LocalSearchRepository["listActiveChunkSnapshots"]>>;
  semanticCandidates?: Awaited<ReturnType<LocalSearchRepository["findSemanticCandidates"]>>;
};

function createMockRepository(options: MockRepositoryOptions = {}): LocalSearchRepository {
  return {
    ensureSchema: vi.fn().mockResolvedValue(undefined),
    upsertSearchChunk: vi.fn().mockResolvedValue(undefined),
    markRecordDeleted: vi.fn().mockResolvedValue(undefined),
    listActiveChunkSnapshots: vi.fn().mockResolvedValue(options.snapshots ?? []),
    findSemanticCandidates: vi.fn().mockResolvedValue(options.semanticCandidates ?? [])
  };
}

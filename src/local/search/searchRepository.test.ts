import { describe, expect, it, vi } from "vitest";
import { createPgliteLocalSearchRepository } from "./searchRepository";

type CapturedQuery = {
  sql: string;
  params: readonly unknown[] | undefined;
};

function createMockSearchDb(rows: unknown[] = []) {
  const capturedQueries: CapturedQuery[] = [];
  const exec = vi.fn(async (_sql: string) => undefined);
  const query = vi.fn(async <T>(sql: string, params?: readonly unknown[]) => {
    capturedQueries.push({ sql, params });
    return { rows: rows as T[] };
  });

  return {
    db: { exec, query },
    capturedQueries
  };
}

describe("createPgliteLocalSearchRepository", () => {
  it("initializes the pgvector-backed local search schema", async () => {
    const { db } = createMockSearchDb();
    const repository = createPgliteLocalSearchRepository(async () => db);

    await repository.ensureSchema();

    expect(db.exec).toHaveBeenCalledOnce();
    expect(db.exec.mock.calls[0]?.[0]).toContain("CREATE EXTENSION IF NOT EXISTS vector");
    expect(db.exec.mock.calls[0]?.[0]).toContain("embedding vector(64)");
    expect(db.exec.mock.calls[0]?.[0]).toContain("idx_local_search_chunks_embedding");
  });

  it("upserts search chunks with stable ordered parameters", async () => {
    const { db, capturedQueries } = createMockSearchDb();
    const repository = createPgliteLocalSearchRepository(async () => db);

    await repository.upsertSearchChunk({
      id: "note-1:0",
      recordId: "note-1",
      recordType: "secure_note",
      chunkIndex: 0,
      sourceUpdatedAt: "2026-05-01T00:00:00.000Z",
      embedding: "[1,0,0]",
      embeddingModel: "deterministic-local-token-hash-v1",
      schemaVersion: 1,
      createdAt: "2026-05-02T00:00:00.000Z",
      updatedAt: "2026-05-02T00:00:00.000Z"
    });

    expect(capturedQueries[0]?.sql).toContain("INSERT INTO local_search_chunks");
    expect(capturedQueries[0]?.sql).toContain("ON CONFLICT");
    expect(capturedQueries[0]?.params).toEqual([
      "note-1:0",
      "note-1",
      "secure_note",
      0,
      "2026-05-01T00:00:00.000Z",
      "[1,0,0]",
      "deterministic-local-token-hash-v1",
      1,
      "2026-05-02T00:00:00.000Z",
      "2026-05-02T00:00:00.000Z"
    ]);
  });

  it("soft-deletes active chunks for a record", async () => {
    const { capturedQueries, db } = createMockSearchDb();
    const repository = createPgliteLocalSearchRepository(async () => db);

    await repository.markRecordDeleted("secure_note", "note-1", "2026-05-03T00:00:00.000Z");

    expect(capturedQueries[0]?.sql).toContain("SET deleted_at = $1");
    expect(capturedQueries[0]?.params).toEqual(["2026-05-03T00:00:00.000Z", "secure_note", "note-1"]);
  });

  it("lists active chunk snapshots", async () => {
    const rows = [
      {
        record_id: "note-1",
        source_updated_at: "2026-05-01T00:00:00.000Z"
      }
    ];
    const { capturedQueries, db } = createMockSearchDb(rows);
    const repository = createPgliteLocalSearchRepository(async () => db);

    await expect(repository.listActiveChunkSnapshots("secure_note", 0)).resolves.toEqual(rows);
    expect(capturedQueries[0]?.sql).toContain("SELECT record_id, source_updated_at");
    expect(capturedQueries[0]?.params).toEqual(["secure_note", 0]);
  });

  it("maps semantic distances into non-negative ranked candidates", async () => {
    const { capturedQueries, db } = createMockSearchDb([
      { record_id: "near-note", distance: 0.15 },
      { record_id: "far-note", distance: 1.5 }
    ]);
    const repository = createPgliteLocalSearchRepository(async () => db);

    await expect(
      repository.findSemanticCandidates({
        recordType: "secure_note",
        embedding: "[1,0,0]",
        embeddingModel: "deterministic-local-token-hash-v1",
        schemaVersion: 1,
        limit: 5
      })
    ).resolves.toEqual([
      { id: "near-note", score: 0.85 },
      { id: "far-note", score: 0 }
    ]);
    expect(capturedQueries[0]?.sql).toContain("embedding <=> $1::vector");
    expect(capturedQueries[0]?.params).toEqual([
      "[1,0,0]",
      "secure_note",
      "deterministic-local-token-hash-v1",
      1,
      5
    ]);
  });
});

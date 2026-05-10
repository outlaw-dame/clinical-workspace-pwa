import { describe, expect, it, vi } from "vitest";
import { createPgliteLocalSearchRepository, type SearchDb } from "./searchRepository";
import { EMBEDDINGGEMMA_SELECTED_DIMENSIONS } from "./localEmbeddingManifests";
import { LOCAL_EMBEDDING_DIMENSIONS } from "./searchConfig";

type CapturedQuery = {
  sql: string;
  params: unknown[] | undefined;
};

function createMockSearchDb(rows: unknown[] = []) {
  const capturedQueries: CapturedQuery[] = [];
  const exec = vi.fn((sql: string) => {
    void sql;
    return Promise.resolve(undefined);
  });
  const query: SearchDb["query"] = <T>(sql: string, params?: unknown[]) => {
    capturedQueries.push({ sql, params });
    return Promise.resolve({ rows: rows as T[] });
  };

  return {
    db: { exec, query } satisfies SearchDb,
    capturedQueries
  };
}

describe("createPgliteLocalSearchRepository", () => {
  it("initializes fallback and EmbeddingGemma pgvector-backed local search schemas", async () => {
    const { db } = createMockSearchDb();
    const repository = createPgliteLocalSearchRepository(() => Promise.resolve(db));

    await repository.ensureSchema();

    const schemaSql = db.exec.mock.calls[0]?.[0] ?? "";
    expect(db.exec).toHaveBeenCalledOnce();
    expect(schemaSql).toContain("CREATE EXTENSION IF NOT EXISTS vector");
    expect(schemaSql).toContain(`embedding vector(${LOCAL_EMBEDDING_DIMENSIONS})`);
    expect(schemaSql).toContain(`embedding vector(${EMBEDDINGGEMMA_SELECTED_DIMENSIONS})`);
    expect(schemaSql).toContain("local_search_chunks_256");
  });

  it("upserts fallback search chunks with stable ordered parameters", async () => {
    const { db, capturedQueries } = createMockSearchDb();
    const repository = createPgliteLocalSearchRepository(() => Promise.resolve(db));

    await repository.upsertSearchChunk({
      id: "note-1:0",
      recordId: "note-1",
      recordType: "secure_note",
      chunkIndex: 0,
      sourceUpdatedAt: "2026-05-01T00:00:00.000Z",
      embedding: "[1,0,0]",
      embeddingDimensions: LOCAL_EMBEDDING_DIMENSIONS,
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

  it("upserts EmbeddingGemma search chunks into the 256-dimensional table", async () => {
    const { db, capturedQueries } = createMockSearchDb();
    const repository = createPgliteLocalSearchRepository(() => Promise.resolve(db));

    await repository.upsertSearchChunk({
      id: "note-1:0:gemma",
      recordId: "note-1",
      recordType: "secure_note",
      chunkIndex: 0,
      sourceUpdatedAt: "2026-05-01T00:00:00.000Z",
      embedding: "[1,0,0]",
      embeddingDimensions: EMBEDDINGGEMMA_SELECTED_DIMENSIONS,
      embeddingModel: "embeddinggemma-300m-onnx-q4-256d-candidate",
      schemaVersion: 1,
      createdAt: "2026-05-02T00:00:00.000Z",
      updatedAt: "2026-05-02T00:00:00.000Z"
    });

    expect(capturedQueries[0]?.sql).toContain("INSERT INTO local_search_chunks_256");
  });

  it("soft-deletes active chunks for a record from the requested dimension table", async () => {
    const { capturedQueries, db } = createMockSearchDb();
    const repository = createPgliteLocalSearchRepository(() => Promise.resolve(db));

    await repository.markRecordDeleted(
      "secure_note",
      "note-1",
      EMBEDDINGGEMMA_SELECTED_DIMENSIONS,
      "2026-05-03T00:00:00.000Z"
    );

    expect(capturedQueries[0]?.sql).toContain("UPDATE local_search_chunks_256");
    expect(capturedQueries[0]?.sql).toContain("SET deleted_at = $1");
    expect(capturedQueries[0]?.params).toEqual(["2026-05-03T00:00:00.000Z", "secure_note", "note-1"]);
  });

  it("lists active chunk snapshots for the requested model and dimensions", async () => {
    const rows = [
      {
        record_id: "note-1",
        source_updated_at: "2026-05-01T00:00:00.000Z"
      }
    ];
    const { capturedQueries, db } = createMockSearchDb(rows);
    const repository = createPgliteLocalSearchRepository(() => Promise.resolve(db));

    await expect(
      repository.listActiveChunkSnapshots(
        "secure_note",
        0,
        "embeddinggemma-300m-onnx-q4-256d-candidate",
        EMBEDDINGGEMMA_SELECTED_DIMENSIONS
      )
    ).resolves.toEqual(rows);
    expect(capturedQueries[0]?.sql).toContain("SELECT record_id, source_updated_at");
    expect(capturedQueries[0]?.sql).toContain("local_search_chunks_256");
    expect(capturedQueries[0]?.params).toEqual(["secure_note", 0, "embeddinggemma-300m-onnx-q4-256d-candidate"]);
  });

  it("maps semantic distances into non-negative ranked candidates", async () => {
    const { capturedQueries, db } = createMockSearchDb([
      { record_id: "near-note", distance: 0.15 },
      { record_id: "far-note", distance: 1.5 }
    ]);
    const repository = createPgliteLocalSearchRepository(() => Promise.resolve(db));

    await expect(
      repository.findSemanticCandidates({
        recordType: "secure_note",
        embedding: "[1,0,0]",
        embeddingDimensions: EMBEDDINGGEMMA_SELECTED_DIMENSIONS,
        embeddingModel: "embeddinggemma-300m-onnx-q4-256d-candidate",
        schemaVersion: 1,
        limit: 5
      })
    ).resolves.toEqual([
      { id: "near-note", score: 0.85 },
      { id: "far-note", score: 0 }
    ]);
    expect(capturedQueries[0]?.sql).toContain("embedding <=> $1::vector");
    expect(capturedQueries[0]?.sql).toContain("local_search_chunks_256");
    expect(capturedQueries[0]?.params).toEqual([
      "[1,0,0]",
      "secure_note",
      "embeddinggemma-300m-onnx-q4-256d-candidate",
      1,
      5
    ]);
  });
});

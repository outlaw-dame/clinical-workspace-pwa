import { getLocalDb } from "../db/client";
import { LOCAL_EMBEDDING_DIMENSIONS, LOCAL_SEARCH_SCHEMA_VERSION } from "./searchConfig";
import { EMBEDDINGGEMMA_SELECTED_DIMENSIONS } from "./localEmbeddingManifests";
import type { RankedSearchCandidate, SearchableRecordType, SearchIndexChunkSnapshot } from "./searchTypes";

export type SupportedSearchEmbeddingDimensions = typeof LOCAL_EMBEDDING_DIMENSIONS | typeof EMBEDDINGGEMMA_SELECTED_DIMENSIONS;

export type SearchChunkUpsert = {
  id: string;
  recordId: string;
  recordType: SearchableRecordType;
  chunkIndex: number;
  sourceUpdatedAt: string;
  embedding: string;
  embeddingDimensions: SupportedSearchEmbeddingDimensions;
  embeddingModel: string;
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
};

export type SemanticSearchRequest = {
  recordType: SearchableRecordType;
  embedding: string;
  embeddingDimensions: SupportedSearchEmbeddingDimensions;
  embeddingModel: string;
  schemaVersion: number;
  limit: number;
};

export type LocalSearchRepository = {
  ensureSchema: () => Promise<void>;
  upsertSearchChunk: (chunk: SearchChunkUpsert) => Promise<void>;
  markRecordDeleted: (
    recordType: SearchableRecordType,
    recordId: string,
    embeddingDimensions: SupportedSearchEmbeddingDimensions,
    deletedAt: string
  ) => Promise<void>;
  listActiveChunkSnapshots: (
    recordType: SearchableRecordType,
    chunkIndex: number,
    embeddingModel: string,
    embeddingDimensions: SupportedSearchEmbeddingDimensions
  ) => Promise<SearchIndexChunkSnapshot[]>;
  findSemanticCandidates: (request: SemanticSearchRequest) => Promise<RankedSearchCandidate[]>;
};

export type SearchDbQueryResult<T> = {
  rows: T[];
};

export type SearchDb = {
  exec: (sql: string) => Promise<unknown>;
  query: <T>(sql: string, params?: unknown[]) => Promise<SearchDbQueryResult<T>>;
};

type SemanticSearchRow = {
  record_id: string;
  distance: number;
};

let defaultLocalSearchRepository: LocalSearchRepository | undefined;

export function getDefaultLocalSearchRepository(): LocalSearchRepository {
  defaultLocalSearchRepository ??= createPgliteLocalSearchRepository();
  return defaultLocalSearchRepository;
}

export function resolveSearchEmbeddingDimensions(dimensions: number): SupportedSearchEmbeddingDimensions {
  if (dimensions === LOCAL_EMBEDDING_DIMENSIONS) return LOCAL_EMBEDDING_DIMENSIONS;
  if (dimensions === EMBEDDINGGEMMA_SELECTED_DIMENSIONS) return EMBEDDINGGEMMA_SELECTED_DIMENSIONS;
  throw new Error(`Unsupported local search embedding dimensions: ${dimensions}`);
}

export function createPgliteLocalSearchRepository(getDb: () => Promise<SearchDb> = getLocalDb): LocalSearchRepository {
  return {
    async ensureSchema() {
      const db = await getDb();

      await db.exec(`
        CREATE EXTENSION IF NOT EXISTS vector;

        ${createSearchTableSql("local_search_chunks", LOCAL_EMBEDDING_DIMENSIONS)}
        ${createSearchTableSql("local_search_chunks_256", EMBEDDINGGEMMA_SELECTED_DIMENSIONS)}
      `);
    },

    async upsertSearchChunk(chunk) {
      const db = await getDb();
      await db.query(
        `INSERT INTO ${getSearchTableName(chunk.embeddingDimensions)} (
           id, record_id, record_type, chunk_index, source_updated_at,
           embedding, embedding_model, schema_version, created_at, updated_at, deleted_at
         ) VALUES ($1, $2, $3, $4, $5, $6::vector, $7, $8, $9, $10, NULL)
         ON CONFLICT (record_id, record_type, chunk_index, embedding_model)
         DO UPDATE SET
           source_updated_at = EXCLUDED.source_updated_at,
           embedding = EXCLUDED.embedding,
           schema_version = EXCLUDED.schema_version,
           updated_at = EXCLUDED.updated_at,
           deleted_at = NULL`,
        [
          chunk.id,
          chunk.recordId,
          chunk.recordType,
          chunk.chunkIndex,
          chunk.sourceUpdatedAt,
          chunk.embedding,
          chunk.embeddingModel,
          chunk.schemaVersion,
          chunk.createdAt,
          chunk.updatedAt
        ]
      );
    },

    async markRecordDeleted(recordType, recordId, embeddingDimensions, deletedAt) {
      const db = await getDb();
      await db.query(
        `UPDATE ${getSearchTableName(embeddingDimensions)}
         SET deleted_at = $1, updated_at = $1
         WHERE record_type = $2 AND record_id = $3 AND deleted_at IS NULL`,
        [deletedAt, recordType, recordId]
      );
    },

    async listActiveChunkSnapshots(recordType, chunkIndex, embeddingModel, embeddingDimensions) {
      const db = await getDb();
      const result = await db.query<SearchIndexChunkSnapshot>(
        `SELECT record_id, source_updated_at
         FROM ${getSearchTableName(embeddingDimensions)}
         WHERE record_type = $1
           AND chunk_index = $2
           AND embedding_model = $3
           AND deleted_at IS NULL`,
        [recordType, chunkIndex, embeddingModel]
      );

      return result.rows;
    },

    async findSemanticCandidates(request) {
      const db = await getDb();
      const result = await db.query<SemanticSearchRow>(
        `SELECT record_id, embedding <=> $1::vector AS distance
         FROM ${getSearchTableName(request.embeddingDimensions)}
         WHERE record_type = $2
           AND embedding_model = $3
           AND schema_version = $4
           AND deleted_at IS NULL
         ORDER BY embedding <=> $1::vector
         LIMIT $5`,
        [request.embedding, request.recordType, request.embeddingModel, request.schemaVersion, request.limit]
      );

      return result.rows.map((row) => ({
        id: row.record_id,
        score: Math.max(0, 1 - Number(row.distance))
      }));
    }
  };
}

function getSearchTableName(dimensions: SupportedSearchEmbeddingDimensions): string {
  return dimensions === LOCAL_EMBEDDING_DIMENSIONS ? "local_search_chunks" : "local_search_chunks_256";
}

function createSearchTableSql(tableName: string, dimensions: SupportedSearchEmbeddingDimensions): string {
  return `
    CREATE TABLE IF NOT EXISTS ${tableName} (
      id TEXT PRIMARY KEY,
      record_id TEXT NOT NULL,
      record_type TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      source_updated_at TEXT NOT NULL,
      embedding vector(${dimensions}) NOT NULL,
      embedding_model TEXT NOT NULL,
      schema_version INTEGER NOT NULL DEFAULT ${LOCAL_SEARCH_SCHEMA_VERSION},
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      UNIQUE (record_id, record_type, chunk_index, embedding_model)
    );

    CREATE INDEX IF NOT EXISTS idx_${tableName}_record
      ON ${tableName} (record_id, record_type, embedding_model)
      WHERE deleted_at IS NULL;

    CREATE INDEX IF NOT EXISTS idx_${tableName}_embedding
      ON ${tableName} USING hnsw (embedding vector_cosine_ops);
  `;
}

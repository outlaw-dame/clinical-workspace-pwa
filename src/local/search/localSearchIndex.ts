import { recordAuditEventSafely } from "../audit/auditRepository";
import { getLocalDb } from "../db/client";
import { createLocalEmbedding, createQueryEmbedding, toPgVector } from "./embeddingModelRegistry";
import { reciprocalRankFusion } from "./hybridFusion";
import { sanitizeSearchQuery, createSafePreview } from "./searchSanitization";
import {
  DEFAULT_LOCAL_SEARCH_LIMIT,
  LOCAL_EMBEDDING_DIMENSIONS,
  LOCAL_EMBEDDING_MODEL,
  LOCAL_SEARCH_SCHEMA_VERSION,
  MAX_LOCAL_SEARCH_LIMIT
} from "./searchConfig";
import type {
  LocalSearchMatchKind,
  LocalSearchOptions,
  LocalSearchResult,
  RankedSearchCandidate,
  SanitizedSearchQuery
} from "./searchTypes";

export type SearchableSecureNote = {
  id: string;
  title: string;
  body: string;
  updatedAt: string;
};

type SearchChunkRow = {
  record_id: string;
  source_updated_at: string;
};

type SemanticSearchRow = {
  record_id: string;
  distance: number;
};

let searchSchemaPromise: Promise<void> | undefined;

export async function ensureLocalSearchSchema(): Promise<void> {
  searchSchemaPromise ??= initializeLocalSearchSchema();
  return searchSchemaPromise;
}

export async function indexSecureNoteForSearch(note: SearchableSecureNote): Promise<void> {
  await ensureLocalSearchSchema();
  const db = await getLocalDb();
  const now = new Date().toISOString();
  const embedding = toPgVector(createLocalEmbedding(`${note.title}\n\n${note.body}`));

  await db.query(
    `INSERT INTO local_search_chunks (
       id, record_id, record_type, chunk_index, source_updated_at,
       embedding, embedding_model, schema_version, created_at, updated_at, deleted_at
     ) VALUES ($1, $2, $3, $4, $5, $6::vector, $7, $8, $9, $10, NULL)
     ON CONFLICT (record_id, record_type, chunk_index)
     DO UPDATE SET
       source_updated_at = EXCLUDED.source_updated_at,
       embedding = EXCLUDED.embedding,
       embedding_model = EXCLUDED.embedding_model,
       schema_version = EXCLUDED.schema_version,
       updated_at = EXCLUDED.updated_at,
       deleted_at = NULL`,
    [
      `${note.id}:0`,
      note.id,
      "secure_note",
      0,
      note.updatedAt,
      embedding,
      LOCAL_EMBEDDING_MODEL,
      LOCAL_SEARCH_SCHEMA_VERSION,
      now,
      now
    ]
  );
}

export async function indexSecureNoteForSearchSafely(note: SearchableSecureNote): Promise<void> {
  try {
    await indexSecureNoteForSearch(note);
  } catch (error) {
    console.warn("Unable to index secure note for local search", error);
  }
}

export async function removeSecureNoteFromSearchIndex(noteId: string): Promise<void> {
  await ensureLocalSearchSchema();
  const db = await getLocalDb();
  await db.query(
    `UPDATE local_search_chunks
     SET deleted_at = $1, updated_at = $1
     WHERE record_type = $2 AND record_id = $3 AND deleted_at IS NULL`,
    [new Date().toISOString(), "secure_note", noteId]
  );
}

export async function removeSecureNoteFromSearchIndexSafely(noteId: string): Promise<void> {
  try {
    await removeSecureNoteFromSearchIndex(noteId);
  } catch (error) {
    console.warn("Unable to remove secure note from local search", error);
  }
}

export async function repairSecureNoteSearchIndex(notes: readonly SearchableSecureNote[]): Promise<void> {
  await ensureLocalSearchSchema();
  const db = await getLocalDb();
  const indexedRows = await db.query<SearchChunkRow>(
    `SELECT record_id, source_updated_at
     FROM local_search_chunks
     WHERE record_type = $1 AND chunk_index = 0 AND deleted_at IS NULL`,
    ["secure_note"]
  );
  const indexedByRecordId = new Map(indexedRows.rows.map((row) => [row.record_id, row.source_updated_at]));
  const activeRecordIds = new Set(notes.map((note) => note.id));

  await Promise.all(
    notes.map(async (note) => {
      if (indexedByRecordId.get(note.id) !== note.updatedAt) {
        await indexSecureNoteForSearch(note);
      }
    })
  );

  await Promise.all(
    indexedRows.rows.map(async (row) => {
      if (!activeRecordIds.has(row.record_id)) {
        await removeSecureNoteFromSearchIndex(row.record_id);
      }
    })
  );
}

export async function searchSecureNotes(
  notes: readonly SearchableSecureNote[],
  queryText: string,
  options: LocalSearchOptions = {}
): Promise<LocalSearchResult[]> {
  const query = sanitizeSearchQuery(queryText);
  const limit = normalizeLimit(options.limit);
  const mode = options.mode ?? "hybrid";

  if (!query.normalized || query.tokens.length === 0) {
    return [];
  }

  await repairSecureNoteSearchIndex(notes).catch((error: unknown) => {
    console.warn("Unable to repair secure note search index", error);
  });

  const lexicalCandidates = mode === "semantic" ? [] : createLexicalCandidates(notes, query, limit);
  const semanticCandidates = mode === "lexical" ? [] : await createSemanticCandidates(query.normalized, limit);
  const fusedCandidates = selectCandidates(mode, lexicalCandidates, semanticCandidates, limit);
  const lexicalIds = new Set(lexicalCandidates.map((candidate) => candidate.id));
  const semanticIds = new Set(semanticCandidates.map((candidate) => candidate.id));
  const notesById = new Map(notes.map((note) => [note.id, note]));
  const results = fusedCandidates
    .map((candidate): LocalSearchResult | undefined => {
      const note = notesById.get(candidate.id);
      if (!note) return undefined;
      return {
        id: note.id,
        recordId: note.id,
        recordType: "secure_note",
        title: note.title,
        preview: createSafePreview(note.body, query),
        score: candidate.score,
        source: "local",
        matchKind: getMatchKind(candidate.id, lexicalIds, semanticIds),
        updatedAt: note.updatedAt
      };
    })
    .filter((result): result is LocalSearchResult => result !== undefined);

  void recordAuditEventSafely("local_search.executed", "local_search", undefined, {
    mode,
    tokenCount: query.tokens.length,
    resultCount: results.length
  });

  return results;
}

export async function runLocalSearchSmokeTest(): Promise<boolean> {
  await ensureLocalSearchSchema();
  const id = `smoke-${crypto.randomUUID()}`;
  const note = {
    id,
    title: "Search smoke test",
    body: "Local hybrid search smoke record",
    updatedAt: new Date().toISOString()
  };

  await indexSecureNoteForSearch(note);
  const results = await searchSecureNotes([note], "hybrid smoke", { limit: 5 });
  await removeSecureNoteFromSearchIndex(id);
  return results.some((result) => result.recordId === id);
}

async function initializeLocalSearchSchema(): Promise<void> {
  const db = await getLocalDb();

  await db.exec(`
    CREATE EXTENSION IF NOT EXISTS vector;

    CREATE TABLE IF NOT EXISTS local_search_chunks (
      id TEXT PRIMARY KEY,
      record_id TEXT NOT NULL,
      record_type TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      source_updated_at TEXT NOT NULL,
      embedding vector(${LOCAL_EMBEDDING_DIMENSIONS}) NOT NULL,
      embedding_model TEXT NOT NULL,
      schema_version INTEGER NOT NULL DEFAULT ${LOCAL_SEARCH_SCHEMA_VERSION},
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      UNIQUE (record_id, record_type, chunk_index)
    );

    CREATE INDEX IF NOT EXISTS idx_local_search_chunks_record
      ON local_search_chunks (record_id, record_type)
      WHERE deleted_at IS NULL;
  `);
}

function createLexicalCandidates(
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

async function createSemanticCandidates(queryText: string, limit: number): Promise<RankedSearchCandidate[]> {
  try {
    await ensureLocalSearchSchema();
    const db = await getLocalDb();
    const queryEmbedding = toPgVector(createQueryEmbedding(queryText));
    const result = await db.query<SemanticSearchRow>(
      `SELECT record_id, embedding <=> $1::vector AS distance
       FROM local_search_chunks
       WHERE record_type = $2
         AND embedding_model = $3
         AND schema_version = $4
         AND deleted_at IS NULL
       ORDER BY embedding <=> $1::vector
       LIMIT $5`,
      [queryEmbedding, "secure_note", LOCAL_EMBEDDING_MODEL, LOCAL_SEARCH_SCHEMA_VERSION, limit]
    );

    return result.rows.map((row) => ({
      id: row.record_id,
      score: Math.max(0, 1 - Number(row.distance))
    }));
  } catch (error) {
    console.warn("Unable to run semantic local search", error);
    return [];
  }
}

function selectCandidates(
  mode: NonNullable<LocalSearchOptions["mode"]>,
  lexicalCandidates: RankedSearchCandidate[],
  semanticCandidates: RankedSearchCandidate[],
  limit: number
): RankedSearchCandidate[] {
  if (mode === "lexical") return lexicalCandidates.slice(0, limit);
  if (mode === "semantic") return semanticCandidates.slice(0, limit);
  return reciprocalRankFusion([lexicalCandidates, semanticCandidates], limit);
}

function scoreLexicalMatch(note: SearchableSecureNote, query: SanitizedSearchQuery): number {
  const title = note.title.toLocaleLowerCase();
  const body = note.body.toLocaleLowerCase();
  let score = 0;

  for (const token of query.tokens) {
    if (title.includes(token)) score += 4;
    if (body.includes(token)) score += 1;
  }

  if (title.includes(query.normalized)) score += 6;
  if (body.includes(query.normalized)) score += 2;

  return score;
}

function getMatchKind(
  id: string,
  lexicalIds: ReadonlySet<string>,
  semanticIds: ReadonlySet<string>
): LocalSearchMatchKind {
  const lexical = lexicalIds.has(id);
  const semantic = semanticIds.has(id);

  if (lexical && semantic) return "hybrid";
  return lexical ? "lexical" : "semantic";
}

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) return DEFAULT_LOCAL_SEARCH_LIMIT;
  return Math.min(MAX_LOCAL_SEARCH_LIMIT, Math.max(1, Math.trunc(limit ?? DEFAULT_LOCAL_SEARCH_LIMIT)));
}

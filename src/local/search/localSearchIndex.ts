import { recordAuditEventSafely } from "../audit/auditRepository";
import {
  createDocumentEmbeddingResult,
  createQueryEmbeddingResult,
  getActiveLocalEmbeddingProvider,
  toPgVector
} from "./embeddingModelRegistry";
import { reciprocalRankFusion } from "./hybridFusion";
import { createLexicalCandidates } from "./lexicalSearch";
import {
  getDefaultLocalSearchRepository,
  type LocalSearchRepository
} from "./searchRepository";
import {
  createDebouncedSearchIndexRepairScheduler,
  planSecureNoteSearchIndexRepair,
  runInBatches
} from "./searchIndexRepair";
import { createSafePreview, sanitizeSearchQuery } from "./searchSanitization";
import {
  DEFAULT_LOCAL_SEARCH_LIMIT,
  LOCAL_SEARCH_SCHEMA_VERSION,
  MAX_LOCAL_SEARCH_LIMIT
} from "./searchConfig";
import type {
  LocalSearchMatchKind,
  LocalSearchOptions,
  LocalSearchResult,
  RankedSearchCandidate,
  SearchableSecureNote
} from "./searchTypes";

export type { SearchableSecureNote } from "./searchTypes";

type LocalSearchRuntimeOptions = LocalSearchOptions & {
  repository?: LocalSearchRepository;
};

const REPAIR_BATCH_SIZE = 12;
const REPAIR_DEBOUNCE_MS = 500;
const schemaInitializationCache = new WeakMap<LocalSearchRepository, Promise<void>>();

export async function ensureLocalSearchSchema(
  repository = getDefaultLocalSearchRepository()
): Promise<void> {
  let promise = schemaInitializationCache.get(repository);

  if (promise === undefined) {
    promise = repository.ensureSchema();
    schemaInitializationCache.set(repository, promise);
  }

  return promise;
}

export async function indexSecureNoteForSearch(
  note: SearchableSecureNote,
  repository = getDefaultLocalSearchRepository()
): Promise<void> {
  await ensureLocalSearchSchema(repository);
  const now = new Date().toISOString();
  const embeddingResult = await createDocumentEmbeddingResult(`${note.title}\n\n${note.body}`);
  const embedding = toPgVector(embeddingResult.embedding, embeddingResult.provider.dimensions);

  await repository.upsertSearchChunk({
    id: `${note.id}:0:${embeddingResult.provider.id}`,
    recordId: note.id,
    recordType: "secure_note",
    chunkIndex: 0,
    sourceUpdatedAt: note.updatedAt,
    embedding,
    embeddingDimensions: embeddingResult.provider.dimensions,
    embeddingModel: embeddingResult.provider.id,
    schemaVersion: LOCAL_SEARCH_SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now
  });
}

export async function indexSecureNoteForSearchSafely(note: SearchableSecureNote): Promise<void> {
  try {
    await indexSecureNoteForSearch(note);
  } catch (error) {
    console.warn("Unable to index secure note for local search", error);
  }
}

export async function removeSecureNoteFromSearchIndex(
  noteId: string,
  repository = getDefaultLocalSearchRepository()
): Promise<void> {
  await ensureLocalSearchSchema(repository);
  const provider = getActiveLocalEmbeddingProvider();
  await repository.markRecordDeleted("secure_note", noteId, provider.dimensions, new Date().toISOString());
}

export async function removeSecureNoteFromSearchIndexSafely(noteId: string): Promise<void> {
  try {
    await removeSecureNoteFromSearchIndex(noteId);
  } catch (error) {
    console.warn("Unable to remove secure note from local search", error);
  }
}

export const scheduleSecureNoteSearchIndexRepair = createDebouncedSearchIndexRepairScheduler<SearchableSecureNote>({
  debounceMs: REPAIR_DEBOUNCE_MS,
  cloneItems: (notes) => notes.map((note) => ({ ...note })),
  repair: repairSecureNoteSearchIndex,
  onError: (error) => console.warn("Unable to repair secure note search index", error)
});

export async function repairSecureNoteSearchIndex(
  notes: readonly SearchableSecureNote[],
  repository = getDefaultLocalSearchRepository()
): Promise<void> {
  await ensureLocalSearchSchema(repository);
  const provider = getActiveLocalEmbeddingProvider();
  const indexedRows = await repository.listActiveChunkSnapshots("secure_note", 0, provider.id, provider.dimensions);
  const repairPlan = planSecureNoteSearchIndexRepair(notes, indexedRows);

  await runInBatches(repairPlan.staleNotes, REPAIR_BATCH_SIZE, (note) => indexSecureNoteForSearch(note, repository));
  await runInBatches(repairPlan.removedRecordIds, REPAIR_BATCH_SIZE, (recordId) =>
    removeSecureNoteFromSearchIndex(recordId, repository)
  );
}

export async function searchSecureNotes(
  notes: readonly SearchableSecureNote[],
  queryText: string,
  options: LocalSearchRuntimeOptions = {}
): Promise<LocalSearchResult[]> {
  const query = sanitizeSearchQuery(queryText);
  const limit = normalizeLimit(options.limit);
  const mode = options.mode ?? "hybrid";
  const repository = options.repository ?? getDefaultLocalSearchRepository();

  if (!query.normalized || query.tokens.length === 0) {
    return [];
  }

  const lexicalCandidates = mode === "semantic" ? [] : createLexicalCandidates(notes, query, limit);
  const semanticCandidates = mode === "lexical" ? [] : await createSemanticCandidates(query.normalized, limit, repository);
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
  const repository = getDefaultLocalSearchRepository();
  await ensureLocalSearchSchema(repository);
  const id = `smoke-${crypto.randomUUID()}`;
  const note = {
    id,
    title: "Search smoke test",
    body: "Local hybrid search smoke record",
    updatedAt: new Date().toISOString()
  };

  await indexSecureNoteForSearch(note, repository);
  const semanticCandidates = await createSemanticCandidates("hybrid smoke", 5, repository);
  await removeSecureNoteFromSearchIndex(id, repository);
  return semanticCandidates.some((candidate) => candidate.id === id);
}

async function createSemanticCandidates(
  queryText: string,
  limit: number,
  repository = getDefaultLocalSearchRepository()
): Promise<RankedSearchCandidate[]> {
  try {
    await ensureLocalSearchSchema(repository);
    const embeddingResult = await createQueryEmbeddingResult(queryText);
    const queryEmbedding = toPgVector(embeddingResult.embedding, embeddingResult.provider.dimensions);

    return repository.findSemanticCandidates({
      recordType: "secure_note",
      embedding: queryEmbedding,
      embeddingDimensions: embeddingResult.provider.dimensions,
      embeddingModel: embeddingResult.provider.id,
      schemaVersion: LOCAL_SEARCH_SCHEMA_VERSION,
      limit
    });
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

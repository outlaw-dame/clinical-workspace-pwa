import type { SearchableSecureNote, SearchIndexChunkSnapshot } from "./searchTypes";

export type SearchIndexRepairPlan = {
  staleNotes: SearchableSecureNote[];
  removedRecordIds: string[];
};

export function planSecureNoteSearchIndexRepair(
  notes: readonly SearchableSecureNote[],
  indexedRows: readonly SearchIndexChunkSnapshot[]
): SearchIndexRepairPlan {
  const indexedByRecordId = new Map(indexedRows.map((row) => [row.record_id, row.source_updated_at]));
  const activeRecordIds = new Set(notes.map((note) => note.id));

  return {
    staleNotes: notes.filter((note) => indexedByRecordId.get(note.id) !== note.updatedAt),
    removedRecordIds: indexedRows
      .map((row) => row.record_id)
      .filter((recordId) => !activeRecordIds.has(recordId))
  };
}

export async function runInBatches<T>(
  items: readonly T[],
  batchSize: number,
  task: (item: T) => Promise<void>
): Promise<void> {
  for (let start = 0; start < items.length; start += batchSize) {
    const batch = items.slice(start, start + batchSize);
    await Promise.all(batch.map((item) => task(item)));
  }
}

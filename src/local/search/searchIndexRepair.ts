import type { SearchableSecureNote, SearchIndexChunkSnapshot } from "./searchTypes";

export type SearchIndexRepairPlan = {
  staleNotes: SearchableSecureNote[];
  removedRecordIds: string[];
};

export type DebouncedRepairSchedulerOptions<T> = {
  debounceMs: number;
  cloneItems: (items: readonly T[]) => T[];
  repair: (items: readonly T[]) => Promise<void>;
  onError?: (error: unknown) => void;
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

export function createDebouncedSearchIndexRepairScheduler<T>(
  options: DebouncedRepairSchedulerOptions<T>
): (items: readonly T[]) => void {
  let scheduledRepairTimer: ReturnType<typeof setTimeout> | undefined;
  let scheduledRepairItems: T[] | undefined;

  return (items: readonly T[]): void => {
    scheduledRepairItems = options.cloneItems(items);

    if (scheduledRepairTimer !== undefined) {
      clearTimeout(scheduledRepairTimer);
    }

    scheduledRepairTimer = setTimeout(() => {
      const itemsToRepair = scheduledRepairItems ?? [];
      scheduledRepairTimer = undefined;
      scheduledRepairItems = undefined;

      void options.repair(itemsToRepair).catch((error: unknown) => {
        options.onError?.(error);
      });
    }, options.debounceMs);
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

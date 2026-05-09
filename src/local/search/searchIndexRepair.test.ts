import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDebouncedSearchIndexRepairScheduler,
  planSecureNoteSearchIndexRepair,
  runInBatches
} from "./searchIndexRepair";
import type { SearchableSecureNote, SearchIndexChunkSnapshot } from "./searchTypes";

const notes: SearchableSecureNote[] = [
  {
    id: "fresh-note",
    title: "Fresh",
    body: "Up to date",
    updatedAt: "2026-05-01T00:00:00.000Z"
  },
  {
    id: "stale-note",
    title: "Stale",
    body: "Needs reindex",
    updatedAt: "2026-05-02T00:00:00.000Z"
  },
  {
    id: "new-note",
    title: "New",
    body: "Missing from index",
    updatedAt: "2026-05-03T00:00:00.000Z"
  }
];

const indexedRows: SearchIndexChunkSnapshot[] = [
  {
    record_id: "fresh-note",
    source_updated_at: "2026-05-01T00:00:00.000Z"
  },
  {
    record_id: "stale-note",
    source_updated_at: "2026-04-30T00:00:00.000Z"
  },
  {
    record_id: "deleted-note",
    source_updated_at: "2026-04-29T00:00:00.000Z"
  }
];

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("planSecureNoteSearchIndexRepair", () => {
  it("identifies stale, missing, and removed search records", () => {
    const plan = planSecureNoteSearchIndexRepair(notes, indexedRows);

    expect(plan.staleNotes.map((note) => note.id)).toEqual(["stale-note", "new-note"]);
    expect(plan.removedRecordIds).toEqual(["deleted-note"]);
  });
});

describe("runInBatches", () => {
  it("limits concurrent work to each batch before starting the next batch", async () => {
    const events: string[] = [];

    await runInBatches([1, 2, 3, 4, 5], 2, async (item) => {
      events.push(`start:${item}`);
      await Promise.resolve();
      events.push(`end:${item}`);
    });

    expect(events).toEqual([
      "start:1",
      "start:2",
      "end:1",
      "end:2",
      "start:3",
      "start:4",
      "end:3",
      "end:4",
      "start:5",
      "end:5"
    ]);
  });
});

describe("createDebouncedSearchIndexRepairScheduler", () => {
  it("debounces repair requests and repairs the latest cloned items", async () => {
    vi.useFakeTimers();
    const repair = vi.fn().mockResolvedValue(undefined);
    const firstItems = [{ id: "first" }];
    const secondItems = [{ id: "second" }];
    const scheduleRepair = createDebouncedSearchIndexRepairScheduler({
      debounceMs: 500,
      cloneItems: (items: readonly { id: string }[]) => items.map((item) => ({ ...item })),
      repair
    });

    scheduleRepair(firstItems);
    scheduleRepair(secondItems);
    secondItems[0]!.id = "mutated-after-schedule";

    await vi.advanceTimersByTimeAsync(499);
    expect(repair).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(repair).toHaveBeenCalledTimes(1);
    expect(repair).toHaveBeenCalledWith([{ id: "second" }]);
  });

  it("reports async repair errors without throwing from the scheduler", async () => {
    vi.useFakeTimers();
    const error = new Error("repair failed");
    const onError = vi.fn();
    const scheduleRepair = createDebouncedSearchIndexRepairScheduler({
      debounceMs: 1,
      cloneItems: (items: readonly string[]) => [...items],
      repair: () => Promise.reject(error),
      onError
    });

    expect(() => scheduleRepair(["note"])).not.toThrow();
    await vi.advanceTimersByTimeAsync(1);

    expect(onError).toHaveBeenCalledWith(error);
  });
});

import { describe, expect, it } from "vitest";
import { createSerializedAsyncQueue } from "./asyncQueue";

const defer = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });

  return { promise, resolve };
};

describe("createSerializedAsyncQueue", () => {
  it("runs queued tasks one at a time in insertion order", async () => {
    const queue = createSerializedAsyncQueue();
    const first = defer<string>();
    const events: string[] = [];

    const firstRun = queue.enqueue(async () => {
      events.push("first:start");
      await first.promise;
      events.push("first:end");
      return "first";
    });

    const secondRun = queue.enqueue(() => {
      events.push("second:start");
      return Promise.resolve("second");
    });

    await Promise.resolve();
    expect(events).toEqual(["first:start"]);

    first.resolve("done");

    await expect(firstRun).resolves.toBe("first");
    await expect(secondRun).resolves.toBe("second");
    expect(events).toEqual(["first:start", "first:end", "second:start"]);
  });

  it("continues processing after a task rejects", async () => {
    const queue = createSerializedAsyncQueue();
    const events: string[] = [];

    const rejected = queue.enqueue(() => {
      events.push("rejecting");
      return Promise.reject(new Error("expected failure"));
    });

    const resolved = queue.enqueue(() => {
      events.push("recovered");
      return Promise.resolve("ok");
    });

    await expect(rejected).rejects.toThrow("expected failure");
    await expect(resolved).resolves.toBe("ok");
    expect(events).toEqual(["rejecting", "recovered"]);
  });
});

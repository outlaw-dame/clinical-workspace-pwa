export type AsyncTask<T> = () => Promise<T>;

export function createSerializedAsyncQueue() {
  let tail: Promise<unknown> = Promise.resolve();

  return {
    enqueue<T>(task: AsyncTask<T>): Promise<T> {
      const run = tail.catch(() => undefined).then(task);
      tail = run.catch(() => undefined);
      return run;
    }
  };
}

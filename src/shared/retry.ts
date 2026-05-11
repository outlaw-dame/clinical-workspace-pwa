export type RetryOptions = {
  attempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterRatio?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  signal?: AbortSignal;
};

export async function retryWithBackoff<T>(task: () => Promise<T>, options: RetryOptions): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    throwIfAborted(options.signal);

    try {
      return await task();
    } catch (error) {
      lastError = error;
      const shouldRetry = attempt < options.attempts && (options.shouldRetry?.(error, attempt) ?? true);
      if (!shouldRetry) break;
      await delay(getBackoffDelayMs(attempt, options), options.signal);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(lastError !== undefined ? `Retry task failed: ${formatUnknownError(lastError)}` : "Retry task failed");
}

export function getBackoffDelayMs(attempt: number, options: RetryOptions): number {
  const exponentialDelay = Math.min(options.maxDelayMs, options.baseDelayMs * 2 ** Math.max(0, attempt - 1));
  const jitterRatio = options.jitterRatio ?? 0.2;
  const jitter = exponentialDelay * jitterRatio * Math.random();
  return Math.round(exponentialDelay + jitter);
}

function delay(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    throwIfAborted(signal);
    const timeoutId = setTimeout(() => {
      signal?.removeEventListener("abort", abortHandler);
      resolve();
    }, ms);
    const abortHandler = (): void => {
      clearTimeout(timeoutId);
      signal?.removeEventListener("abort", abortHandler);
      reject(new DOMException("Operation aborted", "AbortError"));
    };

    signal?.addEventListener("abort", abortHandler, { once: true });
  });
}

function formatUnknownError(error: unknown): string {
  if (typeof error === "string") return error;
  if (typeof error === "number" || typeof error === "boolean" || typeof error === "bigint") {
    return error.toString();
  }

  try {
    return JSON.stringify(error) ?? "unknown";
  } catch {
    return "unknown";
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new DOMException("Operation aborted", "AbortError");
  }
}

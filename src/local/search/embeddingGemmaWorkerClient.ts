import { LocalEmbeddingAbortError, assertEmbeddingNotAborted, type LocalEmbeddingPurpose } from "./embeddingProvider";
import { LocalEmbeddingProviderError } from "./embeddingProviderErrors";
import type { LocalEmbeddingModelManifest } from "./embeddingManifest";
import {
  isLocalEmbeddingWorkerResponse,
  type LocalEmbeddingWorkerRequest,
  type LocalEmbeddingWorkerResponse
} from "./embeddingWorkerProtocol";

const REQUEST_TIMEOUT_MS = 45_000;

type PendingRequest = {
  resolve: (response: LocalEmbeddingWorkerResponse) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
};

let worker: Worker | undefined;
const pendingRequests = new Map<string, PendingRequest>();

export async function loadEmbeddingGemmaWorkerModel(
  manifest: LocalEmbeddingModelManifest,
  signal?: AbortSignal
): Promise<void> {
  const response = await sendWorkerRequest(
    {
      type: "load-model",
      requestId: crypto.randomUUID(),
      manifest
    },
    signal
  );

  if (response.type !== "model-loaded") {
    throw workerResponseToError(response);
  }
}

export async function createEmbeddingGemmaWorkerEmbedding(
  manifest: LocalEmbeddingModelManifest,
  text: string,
  purpose: LocalEmbeddingPurpose,
  signal?: AbortSignal
): Promise<number[]> {
  await loadEmbeddingGemmaWorkerModel(manifest, signal);
  const response = await sendWorkerRequest(
    {
      type: "create-embedding",
      requestId: crypto.randomUUID(),
      manifestId: manifest.id,
      text,
      purpose
    },
    signal
  );

  if (response.type === "embedding-created") {
    return response.embedding;
  }

  throw workerResponseToError(response);
}

export async function disposeEmbeddingGemmaWorkerModel(
  manifestId: string,
  signal?: AbortSignal
): Promise<void> {
  const response = await sendWorkerRequest(
    {
      type: "dispose-model",
      requestId: crypto.randomUUID(),
      manifestId
    },
    signal
  );

  if (response.type !== "model-disposed") {
    throw workerResponseToError(response);
  }
}

export function terminateEmbeddingGemmaWorker(): void {
  for (const pending of pendingRequests.values()) {
    clearTimeout(pending.timeoutId);
    pending.reject(new LocalEmbeddingProviderError("aborted", "EmbeddingGemma worker was terminated"));
  }

  pendingRequests.clear();
  worker?.terminate();
  worker = undefined;
}

async function sendWorkerRequest(
  request: LocalEmbeddingWorkerRequest,
  signal: AbortSignal | undefined
): Promise<LocalEmbeddingWorkerResponse> {
  assertEmbeddingNotAborted(signal);

  return new Promise<LocalEmbeddingWorkerResponse>((resolve, reject) => {
    const activeWorker = getEmbeddingGemmaWorker();
    let abortHandler: (() => void) | undefined;

    const timeoutId = setTimeout(() => {
      const pending = pendingRequests.get(request.requestId);
      if (pending !== undefined) {
        pendingRequests.delete(request.requestId);
        pending.reject(new LocalEmbeddingProviderError("inference_failed", "EmbeddingGemma worker request timed out"));
      }
    }, REQUEST_TIMEOUT_MS);

    abortHandler = (): void => {
      const pending = pendingRequests.get(request.requestId);
      if (pending !== undefined) {
        pendingRequests.delete(request.requestId);
        clearTimeout(timeoutId);
        pending.reject(new LocalEmbeddingAbortError());
      }
    };

    if (signal !== undefined) {
      signal.addEventListener("abort", abortHandler, { once: true });
    }

    pendingRequests.set(request.requestId, {
      resolve: (response) => {
        signal?.removeEventListener("abort", abortHandler);
        resolve(response);
      },
      reject: (error) => {
        signal?.removeEventListener("abort", abortHandler);
        reject(error);
      },
      timeoutId
    });

    activeWorker.postMessage(request);
  });
}

function getEmbeddingGemmaWorker(): Worker {
  if (worker !== undefined) return worker;

  worker = new Worker(new URL("./embeddingGemmaWorker.ts", import.meta.url), { type: "module" });
  worker.addEventListener("message", handleWorkerMessage);
  worker.addEventListener("error", handleWorkerError);
  return worker;
}

function handleWorkerMessage(event: MessageEvent<unknown>): void {
  if (!isLocalEmbeddingWorkerResponse(event.data)) return;
  const pending = pendingRequests.get(event.data.requestId);
  if (pending === undefined) return;

  pendingRequests.delete(event.data.requestId);
  clearTimeout(pending.timeoutId);
  pending.resolve(event.data);
}

function handleWorkerError(): void {
  const error = new LocalEmbeddingProviderError("inference_failed", "EmbeddingGemma worker failed");

  for (const pending of pendingRequests.values()) {
    clearTimeout(pending.timeoutId);
    pending.reject(error);
  }

  pendingRequests.clear();
  worker?.terminate();
  worker = undefined;
}

function workerResponseToError(response: LocalEmbeddingWorkerResponse): LocalEmbeddingProviderError {
  if (response.type === "embedding-error") {
    return new LocalEmbeddingProviderError(response.code, response.message);
  }

  return new LocalEmbeddingProviderError("inference_failed", "EmbeddingGemma worker returned an unexpected response");
}

import { retryWithBackoff, type RetryOptions } from "../../shared/retry";
import type {
  LocalEmbeddingArtifactIntegrity,
  LocalEmbeddingArtifactIntegrityPolicy
} from "./embeddingArtifactIntegrity";
import { LocalEmbeddingProviderError } from "./embeddingProviderErrors";

const EMBEDDING_ARTIFACT_CACHE_NAME = "embedding-artifacts-v1";
const HUGGING_FACE_RESOLVE_BASE_URL = "https://huggingface.co";

export type EmbeddingArtifactVerificationState = "verified" | "unavailable" | "failed";

export type EmbeddingArtifactCacheStatus = {
  modelId: string;
  revision: string;
  state: EmbeddingArtifactVerificationState;
  verifiedCount: number;
  requiredCount: number;
  failedArtifactPaths: string[];
  updatedAt: string;
};

export async function ensureEmbeddingArtifactsVerified(
  policy: LocalEmbeddingArtifactIntegrityPolicy,
  signal?: AbortSignal
): Promise<EmbeddingArtifactCacheStatus> {
  if (!canUseEmbeddingArtifactCache()) {
    return createUnavailableStatus(policy);
  }

  const failedArtifactPaths: string[] = [];
  const requiredArtifacts = policy.artifacts.filter((artifact) => artifact.required);

  for (const artifact of requiredArtifacts) {
    try {
      await ensureArtifactVerified(policy, artifact, signal);
    } catch (error) {
      failedArtifactPaths.push(artifact.path);
      if (isAbortError(error)) throw error;
    }
  }

  if (failedArtifactPaths.length > 0) {
    throw new LocalEmbeddingProviderError(
      "artifact_verification_failed",
      "EmbeddingGemma artifacts could not be verified"
    );
  }

  return {
    modelId: policy.modelId,
    revision: policy.revision,
    state: "verified",
    verifiedCount: requiredArtifacts.length,
    requiredCount: requiredArtifacts.length,
    failedArtifactPaths: [],
    updatedAt: new Date().toISOString()
  };
}

export async function matchVerifiedEmbeddingArtifactFromCache(
  input: RequestInfo | URL,
  policy: LocalEmbeddingArtifactIntegrityPolicy
): Promise<Response | undefined> {
  if (!canUseEmbeddingArtifactCache()) return undefined;

  const requestUrl = normalizeArtifactUrl(input);
  const artifact = policy.artifacts.find((candidate) => createArtifactUrl(policy, candidate) === requestUrl);
  if (artifact === undefined) return undefined;

  const cache = await globalThis.caches.open(EMBEDDING_ARTIFACT_CACHE_NAME);
  const cachedResponse = await cache.match(requestUrl);

  if (cachedResponse === undefined) {
    throw new LocalEmbeddingProviderError(
      "artifact_verification_failed",
      "Verified embedding artifact was missing from cache"
    );
  }

  if (!(await responseMatchesExpectedHash(cachedResponse.clone(), artifact.sha256))) {
    await cache.delete(requestUrl);
    throw new LocalEmbeddingProviderError(
      "artifact_verification_failed",
      "Verified embedding artifact cache entry failed integrity check"
    );
  }

  return cachedResponse;
}

export function canUseEmbeddingArtifactCache(): boolean {
  return (
    "caches" in globalThis &&
    "fetch" in globalThis &&
    "crypto" in globalThis &&
    typeof globalThis.crypto.subtle?.digest === "function"
  );
}

export function createArtifactUrl(policy: LocalEmbeddingArtifactIntegrityPolicy, artifact: LocalEmbeddingArtifactIntegrity): string {
  return `${HUGGING_FACE_RESOLVE_BASE_URL}/${policy.modelId}/resolve/${policy.revision}/${artifact.path}`;
}

async function ensureArtifactVerified(
  policy: LocalEmbeddingArtifactIntegrityPolicy,
  artifact: LocalEmbeddingArtifactIntegrity,
  signal: AbortSignal | undefined
): Promise<void> {
  const cache = await globalThis.caches.open(EMBEDDING_ARTIFACT_CACHE_NAME);
  const url = createArtifactUrl(policy, artifact);
  const cachedResponse = await cache.match(url);

  if (cachedResponse !== undefined && (await responseMatchesExpectedHash(cachedResponse, artifact.sha256))) {
    return;
  }

  if (cachedResponse !== undefined) {
    await cache.delete(url);
  }

  await retryWithBackoff(
    async () => {
      const response = await fetch(url, createArtifactFetchInit(signal));

      if (!response.ok) {
        throw new LocalEmbeddingProviderError("artifact_verification_failed", "Embedding artifact download failed");
      }

      if (!(await responseMatchesExpectedHash(response.clone(), artifact.sha256))) {
        throw new LocalEmbeddingProviderError("artifact_verification_failed", "Embedding artifact hash mismatch");
      }

      await cache.put(url, response);
    },
    createArtifactRetryOptions(signal)
  );
}

async function responseMatchesExpectedHash(response: Response, expectedSha256: string): Promise<boolean> {
  const buffer = await response.arrayBuffer();
  const digest = await globalThis.crypto.subtle.digest("SHA-256", buffer);
  return toLowercaseHex(digest) === expectedSha256;
}

function createArtifactFetchInit(signal: AbortSignal | undefined): RequestInit {
  const init: RequestInit = {
    cache: "reload",
    credentials: "omit"
  };

  if (signal !== undefined) {
    init.signal = signal;
  }

  return init;
}

function createArtifactRetryOptions(signal: AbortSignal | undefined): RetryOptions {
  const options: RetryOptions = {
    attempts: 3,
    baseDelayMs: 500,
    maxDelayMs: 4_000,
    jitterRatio: 0.3,
    shouldRetry: (error) => !isAbortError(error)
  };

  if (signal !== undefined) {
    options.signal = signal;
  }

  return options;
}

function normalizeArtifactUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return new URL(input, globalThis.location?.origin).href;
  if (input instanceof URL) return input.href;
  return input.url;
}

function toLowercaseHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function createUnavailableStatus(policy: LocalEmbeddingArtifactIntegrityPolicy): EmbeddingArtifactCacheStatus {
  const requiredCount = policy.artifacts.filter((artifact) => artifact.required).length;

  return {
    modelId: policy.modelId,
    revision: policy.revision,
    state: "unavailable",
    verifiedCount: 0,
    requiredCount,
    failedArtifactPaths: policy.artifacts.filter((artifact) => artifact.required).map((artifact) => artifact.path),
    updatedAt: new Date().toISOString()
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

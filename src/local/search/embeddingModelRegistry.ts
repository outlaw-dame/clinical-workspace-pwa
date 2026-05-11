import { deterministicLocalEmbeddingProvider, createDeterministicTokenHashEmbedding } from "./deterministicEmbeddingProvider";
import { embeddingGemmaLocalEmbeddingProvider } from "./embeddingGemmaProvider";
import {
  createEmbeddingWithProvider,
  isLocalEmbeddingAbortError,
  serializeEmbeddingForPgVector,
  type LocalEmbeddingInput,
  type LocalEmbeddingProvider,
  type LocalEmbeddingPurpose
} from "./embeddingProvider";
import { isLocalEmbeddingProviderError } from "./embeddingProviderErrors";
import { canUseLocalTransformerWorkerRuntime } from "./embeddingRuntimeCapabilities";
import { assertValidLocalEmbeddingManifest } from "./embeddingManifestValidation";
import { getActiveLocalEmbeddingManifest, getFallbackLocalEmbeddingManifest } from "./localEmbeddingManifests";
import { sanitizeSearchQuery } from "./searchSanitization";

export type LocalEmbeddingResult = {
  embedding: number[];
  provider: LocalEmbeddingProvider;
};

export const preferredLocalEmbeddingProvider = embeddingGemmaLocalEmbeddingProvider;
export const fallbackLocalEmbeddingProvider = deterministicLocalEmbeddingProvider;

let preferFallbackForSession = false;

export function getActiveLocalEmbeddingProvider(): LocalEmbeddingProvider {
  if (preferFallbackForSession || !canUseLocalTransformerWorkerRuntime()) {
    assertValidLocalEmbeddingManifest(getFallbackLocalEmbeddingManifest());
    return fallbackLocalEmbeddingProvider;
  }

  assertValidLocalEmbeddingManifest(getActiveLocalEmbeddingManifest());
  return preferredLocalEmbeddingProvider;
}

export async function createDocumentEmbedding(value: string, signal?: AbortSignal): Promise<number[]> {
  return (await createDocumentEmbeddingResult(value, signal)).embedding;
}

export async function createDocumentEmbeddingResult(value: string, signal?: AbortSignal): Promise<LocalEmbeddingResult> {
  return createEmbeddingResult(value, "document", signal);
}

export async function createQueryEmbeddingWithProvider(value: string, signal?: AbortSignal): Promise<number[]> {
  return (await createQueryEmbeddingResult(value, signal)).embedding;
}

export async function createQueryEmbeddingResult(value: string, signal?: AbortSignal): Promise<LocalEmbeddingResult> {
  return createEmbeddingResult(value, "query", signal);
}

export function createLocalEmbedding(value: string): number[] {
  return createDeterministicTokenHashEmbedding(value);
}

export function createQueryEmbedding(value: string): number[] {
  const query = sanitizeSearchQuery(value);
  return createLocalEmbedding(query.normalized);
}

export function toPgVector(value: readonly number[], dimensions = value.length): string {
  return serializeEmbeddingForPgVector(value, dimensions);
}

async function createEmbeddingResult(
  text: string,
  purpose: LocalEmbeddingPurpose,
  signal: AbortSignal | undefined
): Promise<LocalEmbeddingResult> {
  const input = createLocalEmbeddingInput(text, purpose, signal);
  const activeProvider = getActiveLocalEmbeddingProvider();

  if (activeProvider === fallbackLocalEmbeddingProvider) {
    return {
      embedding: await createEmbeddingWithProvider(fallbackLocalEmbeddingProvider, input),
      provider: fallbackLocalEmbeddingProvider
    };
  }

  try {
    return {
      embedding: await createEmbeddingWithProvider(activeProvider, input),
      provider: activeProvider
    };
  } catch (error) {
    if (isEmbeddingAbort(error)) {
      throw error;
    }

    preferFallbackForSession = true;
    console.warn("EmbeddingGemma unavailable; using deterministic local fallback", error);
    return {
      embedding: await createEmbeddingWithProvider(fallbackLocalEmbeddingProvider, input),
      provider: fallbackLocalEmbeddingProvider
    };
  }
}

function createLocalEmbeddingInput(
  text: string,
  purpose: LocalEmbeddingPurpose,
  signal: AbortSignal | undefined
): LocalEmbeddingInput {
  return signal === undefined ? { text, purpose } : { text, purpose, signal };
}

function isEmbeddingAbort(error: unknown): boolean {
  return (
    isLocalEmbeddingAbortError(error) ||
    (isLocalEmbeddingProviderError(error) && error.code === "aborted") ||
    (error instanceof DOMException && error.name === "AbortError")
  );
}

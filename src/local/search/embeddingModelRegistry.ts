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
import { assertValidLocalEmbeddingManifest } from "./embeddingManifestValidation";
import { getActiveLocalEmbeddingManifest } from "./localEmbeddingManifests";
import { sanitizeSearchQuery } from "./searchSanitization";

export type LocalEmbeddingResult = {
  embedding: number[];
  provider: LocalEmbeddingProvider;
};

export const preferredLocalEmbeddingProvider = embeddingGemmaLocalEmbeddingProvider;
export const fallbackLocalEmbeddingProvider = deterministicLocalEmbeddingProvider;

export function getActiveLocalEmbeddingProvider(): LocalEmbeddingProvider {
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

  try {
    return {
      embedding: await createEmbeddingWithProvider(preferredLocalEmbeddingProvider, input),
      provider: preferredLocalEmbeddingProvider
    };
  } catch (error) {
    if (isLocalEmbeddingAbortError(error) || (isLocalEmbeddingProviderError(error) && error.code === "aborted")) {
      throw error;
    }

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

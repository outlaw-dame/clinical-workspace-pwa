import { deterministicLocalEmbeddingProvider, createDeterministicTokenHashEmbedding } from "./deterministicEmbeddingProvider";
import {
  createEmbeddingWithProvider,
  serializeEmbeddingForPgVector,
  type LocalEmbeddingInput,
  type LocalEmbeddingProvider,
  type LocalEmbeddingPurpose
} from "./embeddingProvider";
import { LOCAL_EMBEDDING_DIMENSIONS } from "./searchConfig";
import { sanitizeSearchQuery } from "./searchSanitization";

export const activeLocalEmbeddingProvider = deterministicLocalEmbeddingProvider;

export function getActiveLocalEmbeddingProvider(): LocalEmbeddingProvider {
  return activeLocalEmbeddingProvider;
}

export async function createDocumentEmbedding(value: string, signal?: AbortSignal): Promise<number[]> {
  return createEmbeddingWithProvider(
    activeLocalEmbeddingProvider,
    createLocalEmbeddingInput(value, "document", signal)
  );
}

export async function createQueryEmbeddingWithProvider(value: string, signal?: AbortSignal): Promise<number[]> {
  return createEmbeddingWithProvider(
    activeLocalEmbeddingProvider,
    createLocalEmbeddingInput(value, "query", signal)
  );
}

export function createLocalEmbedding(value: string): number[] {
  return createDeterministicTokenHashEmbedding(value);
}

export function createQueryEmbedding(value: string): number[] {
  const query = sanitizeSearchQuery(value);
  return createLocalEmbedding(query.normalized);
}

export function toPgVector(value: readonly number[]): string {
  return serializeEmbeddingForPgVector(value, LOCAL_EMBEDDING_DIMENSIONS);
}

function createLocalEmbeddingInput(
  text: string,
  purpose: LocalEmbeddingPurpose,
  signal: AbortSignal | undefined
): LocalEmbeddingInput {
  return signal === undefined ? { text, purpose } : { text, purpose, signal };
}

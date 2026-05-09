import { deterministicLocalEmbeddingProvider, createDeterministicTokenHashEmbedding } from "./deterministicEmbeddingProvider";
import {
  createEmbeddingWithProvider,
  serializeEmbeddingForPgVector,
  type LocalEmbeddingProvider
} from "./embeddingProvider";
import { LOCAL_EMBEDDING_DIMENSIONS } from "./searchConfig";
import { sanitizeSearchQuery } from "./searchSanitization";

export const activeLocalEmbeddingProvider = deterministicLocalEmbeddingProvider;

export function getActiveLocalEmbeddingProvider(): LocalEmbeddingProvider {
  return activeLocalEmbeddingProvider;
}

export async function createDocumentEmbedding(value: string, signal?: AbortSignal): Promise<number[]> {
  return createEmbeddingWithProvider(activeLocalEmbeddingProvider, {
    text: value,
    purpose: "document",
    signal
  });
}

export async function createQueryEmbeddingWithProvider(value: string, signal?: AbortSignal): Promise<number[]> {
  return createEmbeddingWithProvider(activeLocalEmbeddingProvider, {
    text: value,
    purpose: "query",
    signal
  });
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

import {
  assertEmbeddingNotAborted,
  normalizeEmbeddingVector,
  type LocalEmbeddingInput,
  type LocalEmbeddingProvider
} from "./embeddingProvider";
import { LOCAL_EMBEDDING_DIMENSIONS, LOCAL_EMBEDDING_MODEL } from "./searchConfig";
import { sanitizeSearchQuery } from "./searchSanitization";

const MAX_EMBEDDING_TEXT_LENGTH = 8_000;
const TOKEN_PATTERN = /[\p{L}\p{N}][\p{L}\p{N}'-]*/gu;

export const deterministicLocalEmbeddingProvider: LocalEmbeddingProvider = {
  id: LOCAL_EMBEDDING_MODEL,
  displayName: "Deterministic local token hash",
  dimensions: LOCAL_EMBEDDING_DIMENSIONS,
  privacyBoundary: "local-only",
  createEmbedding: ({ text, purpose, signal }: LocalEmbeddingInput) => {
    assertEmbeddingNotAborted(signal);
    const normalizedText = purpose === "query" ? sanitizeSearchQuery(text).normalized : text;
    return createDeterministicTokenHashEmbedding(normalizedText, signal);
  }
};

export function createDeterministicTokenHashEmbedding(value: string, signal?: AbortSignal): number[] {
  const text = value.slice(0, MAX_EMBEDDING_TEXT_LENGTH).toLowerCase();
  const vector = new Array<number>(LOCAL_EMBEDDING_DIMENSIONS).fill(0);

  for (const [token] of text.matchAll(TOKEN_PATTERN)) {
    assertEmbeddingNotAborted(signal);
    const normalizedToken = token.replace(/^[-']+|[-']+$/g, "");
    if (normalizedToken.length < 2) continue;

    const index = stableHash(normalizedToken) % LOCAL_EMBEDDING_DIMENSIONS;
    vector[index] += 1 / Math.sqrt(normalizedToken.length);
  }

  return normalizeEmbeddingVector(vector);
}

function stableHash(value: string): number {
  let hash = 2_166_136_261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }

  return hash >>> 0;
}

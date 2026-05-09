import { sanitizeSearchQuery } from "./searchSanitization";
import { LOCAL_EMBEDDING_DIMENSIONS } from "./searchConfig";

const MAX_EMBEDDING_TEXT_LENGTH = 8_000;
const TOKEN_PATTERN = /[\p{L}\p{N}][\p{L}\p{N}'-]*/gu;

export function createLocalEmbedding(value: string): number[] {
  const text = value.slice(0, MAX_EMBEDDING_TEXT_LENGTH).toLocaleLowerCase();
  const vector = new Array<number>(LOCAL_EMBEDDING_DIMENSIONS).fill(0);
  const tokens = Array.from(text.matchAll(TOKEN_PATTERN), ([match]) => match);

  for (const token of tokens) {
    const normalizedToken = token.replace(/^[-']+|[-']+$/g, "");
    if (normalizedToken.length < 2) continue;

    const index = stableHash(normalizedToken) % LOCAL_EMBEDDING_DIMENSIONS;
    vector[index] += 1 / Math.sqrt(normalizedToken.length);
  }

  return normalizeVector(vector);
}

export function createQueryEmbedding(value: string): number[] {
  const query = sanitizeSearchQuery(value);
  return createLocalEmbedding(query.normalized);
}

export function toPgVector(value: readonly number[]): string {
  if (value.length !== LOCAL_EMBEDDING_DIMENSIONS) {
    throw new Error("Local embedding dimensions do not match the configured pgvector size");
  }

  return `[${value.map((item) => Number(item.toFixed(6))).join(",")}]`;
}

function normalizeVector(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (magnitude === 0) return vector;
  return vector.map((value) => value / magnitude);
}

function stableHash(value: string): number {
  let hash = 2_166_136_261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }

  return hash >>> 0;
}

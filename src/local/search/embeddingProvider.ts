export type LocalEmbeddingPurpose = "document" | "query";

export type LocalEmbeddingPrivacyBoundary = "local-only";

export type LocalEmbeddingInput = {
  text: string;
  purpose: LocalEmbeddingPurpose;
  signal?: AbortSignal;
};

export type LocalEmbeddingProvider = {
  id: string;
  displayName: string;
  dimensions: number;
  privacyBoundary: LocalEmbeddingPrivacyBoundary;
  createEmbedding: (input: LocalEmbeddingInput) => number[] | Promise<number[]>;
};

export class LocalEmbeddingAbortError extends Error {
  constructor() {
    super("Local embedding generation was aborted");
    this.name = "LocalEmbeddingAbortError";
  }
}

export function assertEmbeddingNotAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new LocalEmbeddingAbortError();
  }
}

export function isLocalEmbeddingAbortError(error: unknown): error is LocalEmbeddingAbortError {
  return error instanceof LocalEmbeddingAbortError;
}

export async function createEmbeddingWithProvider(
  provider: LocalEmbeddingProvider,
  input: LocalEmbeddingInput
): Promise<number[]> {
  assertEmbeddingNotAborted(input.signal);
  const embedding = await provider.createEmbedding(input);
  assertEmbeddingNotAborted(input.signal);
  assertEmbeddingDimensions(provider, embedding);
  return embedding;
}

export function assertEmbeddingDimensions(
  provider: Pick<LocalEmbeddingProvider, "dimensions" | "id">,
  embedding: readonly number[]
): void {
  if (embedding.length !== provider.dimensions) {
    throw new Error(`Embedding provider ${provider.id} returned ${embedding.length} dimensions; expected ${provider.dimensions}`);
  }
}

export function serializeEmbeddingForPgVector(embedding: readonly number[], dimensions: number): string {
  if (embedding.length !== dimensions) {
    throw new Error("Local embedding dimensions do not match the configured pgvector size");
  }

  return `[${embedding.map((item) => Number(item.toFixed(6))).join(",")}]`;
}

export function normalizeEmbeddingVector(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (magnitude === 0) return vector;
  return vector.map((value) => value / magnitude);
}

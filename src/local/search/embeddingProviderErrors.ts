export type LocalEmbeddingProviderErrorCode =
  | "unsupported_runtime"
  | "model_not_configured"
  | "model_not_loaded"
  | "model_load_failed"
  | "inference_failed"
  | "invalid_manifest";

export class LocalEmbeddingProviderError extends Error {
  readonly code: LocalEmbeddingProviderErrorCode;

  constructor(code: LocalEmbeddingProviderErrorCode, message: string) {
    super(message);
    this.name = "LocalEmbeddingProviderError";
    this.code = code;
  }
}

export function isLocalEmbeddingProviderError(error: unknown): error is LocalEmbeddingProviderError {
  return error instanceof LocalEmbeddingProviderError;
}

export function normalizeLocalEmbeddingProviderError(error: unknown): LocalEmbeddingProviderError {
  if (isLocalEmbeddingProviderError(error)) return error;
  return new LocalEmbeddingProviderError("inference_failed", "Local embedding provider failed");
}

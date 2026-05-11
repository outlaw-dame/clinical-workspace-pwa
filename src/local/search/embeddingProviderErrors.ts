import { LocalEmbeddingAbortError } from "./embeddingProvider";

export type LocalEmbeddingProviderErrorCode =
  | "unsupported_runtime"
  | "model_not_configured"
  | "model_not_loaded"
  | "model_load_failed"
  | "inference_failed"
  | "invalid_manifest"
  | "artifact_verification_failed"
  | "aborted";

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
  if (error instanceof LocalEmbeddingAbortError) {
    return new LocalEmbeddingProviderError("aborted", "Local embedding generation was aborted");
  }

  return new LocalEmbeddingProviderError("inference_failed", "Local embedding provider failed");
}

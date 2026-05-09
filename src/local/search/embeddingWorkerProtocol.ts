import type { LocalEmbeddingPurpose } from "./embeddingProvider";
import type { LocalEmbeddingModelManifest } from "./embeddingManifest";
import type { LocalEmbeddingProviderErrorCode } from "./embeddingProviderErrors";

export type LocalEmbeddingWorkerRequest =
  | {
      type: "load-model";
      requestId: string;
      manifest: LocalEmbeddingModelManifest;
    }
  | {
      type: "create-embedding";
      requestId: string;
      manifestId: string;
      text: string;
      purpose: LocalEmbeddingPurpose;
    }
  | {
      type: "dispose-model";
      requestId: string;
      manifestId: string;
    };

export type LocalEmbeddingWorkerResponse =
  | {
      type: "model-loaded";
      requestId: string;
      manifestId: string;
    }
  | {
      type: "embedding-created";
      requestId: string;
      manifestId: string;
      embedding: number[];
    }
  | {
      type: "model-disposed";
      requestId: string;
      manifestId: string;
    }
  | {
      type: "embedding-error";
      requestId: string;
      code: LocalEmbeddingProviderErrorCode;
      message: string;
    };

const VALID_ERROR_CODES = new Set<LocalEmbeddingProviderErrorCode>([
  "unsupported_runtime",
  "model_not_configured",
  "model_not_loaded",
  "model_load_failed",
  "inference_failed",
  "invalid_manifest",
  "aborted"
]);

export function isLocalEmbeddingWorkerResponse(value: unknown): value is LocalEmbeddingWorkerResponse {
  if (!value || typeof value !== "object") return false;
  const response = value as {
    type?: unknown;
    requestId?: unknown;
    manifestId?: unknown;
    embedding?: unknown;
    code?: unknown;
    message?: unknown;
  };

  if (typeof response.requestId !== "string") return false;

  switch (response.type) {
    case "model-loaded":
    case "model-disposed":
      return typeof response.manifestId === "string";
    case "embedding-created":
      return typeof response.manifestId === "string" && isNumberArray(response.embedding);
    case "embedding-error":
      return (
        typeof response.message === "string" &&
        typeof response.code === "string" &&
        VALID_ERROR_CODES.has(response.code as LocalEmbeddingProviderErrorCode)
      );
    default:
      return false;
  }
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => typeof item === "number" && Number.isFinite(item));
}

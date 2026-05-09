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

export function isLocalEmbeddingWorkerResponse(value: unknown): value is LocalEmbeddingWorkerResponse {
  if (!value || typeof value !== "object") return false;
  const response = value as { type?: unknown; requestId?: unknown };
  return typeof response.requestId === "string" && typeof response.type === "string";
}

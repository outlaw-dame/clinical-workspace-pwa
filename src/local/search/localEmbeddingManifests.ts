import type { LocalEmbeddingModelManifest } from "./embeddingManifest";
import { LOCAL_EMBEDDING_DIMENSIONS, LOCAL_EMBEDDING_MODEL } from "./searchConfig";

export const deterministicLocalEmbeddingManifest: LocalEmbeddingModelManifest = {
  id: LOCAL_EMBEDDING_MODEL,
  displayName: "Deterministic local token hash",
  modelId: LOCAL_EMBEDDING_MODEL,
  revision: "1",
  dimensions: LOCAL_EMBEDDING_DIMENSIONS,
  runtime: "deterministic-token-hash",
  privacyBoundary: "local-only",
  quality: "fallback",
  artifactSource: "bundled"
};

export function getActiveLocalEmbeddingManifest(): LocalEmbeddingModelManifest {
  return deterministicLocalEmbeddingManifest;
}

import type { LocalEmbeddingModelManifest } from "./embeddingManifest";
import { LOCAL_EMBEDDING_DIMENSIONS, LOCAL_EMBEDDING_MODEL } from "./searchConfig";

export const EMBEDDINGGEMMA_CANDIDATE_MODEL_ID = "onnx-community/embeddinggemma-300m-ONNX";
export const EMBEDDINGGEMMA_BASE_MODEL_ID = "google/embeddinggemma-300m";
export const EMBEDDINGGEMMA_BASE_DIMENSIONS = 768;
export const EMBEDDINGGEMMA_SELECTED_DIMENSIONS = 256;
export const EMBEDDINGGEMMA_SUPPORTED_DIMENSIONS = [768, 512, 256, 128] as const;

export const deterministicLocalEmbeddingManifest: LocalEmbeddingModelManifest = {
  id: LOCAL_EMBEDDING_MODEL,
  displayName: "Deterministic local token hash",
  modelId: LOCAL_EMBEDDING_MODEL,
  revision: "1",
  dimensions: LOCAL_EMBEDDING_DIMENSIONS,
  runtime: "deterministic-token-hash",
  privacyBoundary: "local-only",
  quality: "fallback",
  artifactSource: "bundled",
  activationState: "active"
};

export const embeddingGemma300mCandidateManifest: LocalEmbeddingModelManifest = {
  id: "embeddinggemma-300m-onnx-q4-256d-candidate",
  displayName: "EmbeddingGemma 300M ONNX q4 candidate",
  modelId: EMBEDDINGGEMMA_CANDIDATE_MODEL_ID,
  baseModelId: EMBEDDINGGEMMA_BASE_MODEL_ID,
  revision: "main-pending-sha-lock",
  dimensions: EMBEDDINGGEMMA_SELECTED_DIMENSIONS,
  baseDimensions: EMBEDDINGGEMMA_BASE_DIMENSIONS,
  supportedDimensions: EMBEDDINGGEMMA_SUPPORTED_DIMENSIONS,
  runtime: "local-transformer-worker",
  privacyBoundary: "local-only",
  quality: "candidate",
  artifactSource: "origin-cache",
  activationState: "candidate",
  defaultDtype: "q4",
  fallbackDtypes: ["q8", "fp32"],
  promptPolicy: {
    queryPrefix: "task: search result | query: ",
    documentTitlePrefix: "title: ",
    documentTextPrefix: "text: ",
    documentSeparator: " | "
  }
};

export function getActiveLocalEmbeddingManifest(): LocalEmbeddingModelManifest {
  return deterministicLocalEmbeddingManifest;
}

export function getCandidateLocalEmbeddingManifests(): readonly LocalEmbeddingModelManifest[] {
  return [embeddingGemma300mCandidateManifest];
}

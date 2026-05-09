import type { LocalEmbeddingPrivacyBoundary } from "./embeddingProvider";

export type LocalEmbeddingRuntime = "deterministic-token-hash" | "local-transformer-worker";

export type LocalEmbeddingModelQuality = "fallback" | "candidate" | "validated";

export type LocalEmbeddingArtifactSource = "bundled" | "origin-cache" | "user-provided";

export type LocalEmbeddingModelManifest = {
  id: string;
  displayName: string;
  modelId: string;
  revision: string;
  dimensions: number;
  runtime: LocalEmbeddingRuntime;
  privacyBoundary: LocalEmbeddingPrivacyBoundary;
  quality: LocalEmbeddingModelQuality;
  artifactSource: LocalEmbeddingArtifactSource;
  artifactSha256?: string;
};

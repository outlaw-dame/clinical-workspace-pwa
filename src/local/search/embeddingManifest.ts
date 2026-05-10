import type { LocalEmbeddingPrivacyBoundary } from "./embeddingProvider";

export type LocalEmbeddingRuntime = "deterministic-token-hash" | "local-transformer-worker";

export type LocalEmbeddingModelQuality = "fallback" | "candidate" | "validated";

export type LocalEmbeddingArtifactSource = "bundled" | "origin-cache" | "user-provided";

export type LocalEmbeddingDtype = "fp32" | "q8" | "q4";

export type LocalEmbeddingActivationState = "active" | "candidate" | "fallback" | "disabled";

export type LocalEmbeddingPromptPolicy = {
  queryPrefix: string;
  documentTitlePrefix: string;
  documentTextPrefix: string;
  documentSeparator: string;
};

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
  activationState: LocalEmbeddingActivationState;
  artifactSha256?: string;
  baseModelId?: string;
  baseDimensions?: number;
  supportedDimensions?: readonly number[];
  defaultDtype?: LocalEmbeddingDtype;
  fallbackDtypes?: readonly LocalEmbeddingDtype[];
  promptPolicy?: LocalEmbeddingPromptPolicy;
};

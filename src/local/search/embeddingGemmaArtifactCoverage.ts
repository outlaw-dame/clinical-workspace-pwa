import type { LocalEmbeddingArtifactIntegrityPolicy } from "./embeddingArtifactIntegrity";
import { LocalEmbeddingProviderError } from "./embeddingProviderErrors";

export const EMBEDDINGGEMMA_REQUIRED_TRANSFORMERS_METADATA_PATHS = [
  "added_tokens.json",
  "config.json",
  "generation_config.json",
  "special_tokens_map.json",
  "tokenizer_config.json"
] as const;

export type EmbeddingGemmaRequiredMetadataPath = (typeof EMBEDDINGGEMMA_REQUIRED_TRANSFORMERS_METADATA_PATHS)[number];

export type EmbeddingGemmaArtifactCoverageStatus = {
  complete: boolean;
  pinnedArtifactPaths: string[];
  missingRequiredArtifactPaths: EmbeddingGemmaRequiredMetadataPath[];
};

export function getEmbeddingGemmaArtifactCoverageStatus(
  policy: LocalEmbeddingArtifactIntegrityPolicy
): EmbeddingGemmaArtifactCoverageStatus {
  const pinnedArtifactPaths = policy.artifacts.map((artifact) => artifact.path).sort((left, right) => left.localeCompare(right));
  const pinnedArtifactPathSet = new Set(pinnedArtifactPaths);
  const missingRequiredArtifactPaths = EMBEDDINGGEMMA_REQUIRED_TRANSFORMERS_METADATA_PATHS.filter(
    (path) => !pinnedArtifactPathSet.has(path)
  );

  return {
    complete: missingRequiredArtifactPaths.length === 0,
    pinnedArtifactPaths,
    missingRequiredArtifactPaths
  };
}

export function assertEmbeddingGemmaArtifactCoverageComplete(
  policy: LocalEmbeddingArtifactIntegrityPolicy
): void {
  const status = getEmbeddingGemmaArtifactCoverageStatus(policy);

  if (!status.complete) {
    throw new LocalEmbeddingProviderError(
      "artifact_verification_failed",
      `EmbeddingGemma artifact policy is missing required pinned metadata: ${status.missingRequiredArtifactPaths.join(", ")}`
    );
  }
}

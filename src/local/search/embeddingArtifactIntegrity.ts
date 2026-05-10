import { LocalEmbeddingProviderError } from "./embeddingProviderErrors";

export type LocalEmbeddingArtifactDtype = "fp32" | "q8" | "q4";

export type LocalEmbeddingArtifactIntegrity = {
  path: string;
  dtype: LocalEmbeddingArtifactDtype;
  sha256: string;
  remoteSizeLabel: string;
  required: boolean;
};

export type LocalEmbeddingArtifactIntegrityPolicy = {
  manifestId: string;
  modelId: string;
  revision: string;
  artifacts: readonly LocalEmbeddingArtifactIntegrity[];
};

export function assertValidArtifactIntegrityPolicy(policy: LocalEmbeddingArtifactIntegrityPolicy): void {
  if (!policy.manifestId || !policy.modelId || !policy.revision) {
    throw new LocalEmbeddingProviderError("invalid_manifest", "Embedding artifact policy is missing required identifiers");
  }

  if (policy.artifacts.length === 0) {
    throw new LocalEmbeddingProviderError("invalid_manifest", "Embedding artifact policy must include at least one artifact");
  }

  const paths = new Set<string>();

  for (const artifact of policy.artifacts) {
    if (!artifact.path || !artifact.remoteSizeLabel) {
      throw new LocalEmbeddingProviderError("invalid_manifest", "Embedding artifact policy includes an incomplete artifact");
    }

    if (paths.has(artifact.path)) {
      throw new LocalEmbeddingProviderError("invalid_manifest", "Embedding artifact policy contains duplicate paths");
    }

    paths.add(artifact.path);

    if (!/^[a-f0-9]{64}$/u.test(artifact.sha256)) {
      throw new LocalEmbeddingProviderError("invalid_manifest", "Embedding artifact SHA-256 must be lowercase hex");
    }
  }
}

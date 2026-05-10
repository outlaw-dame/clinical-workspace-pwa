import { LocalEmbeddingProviderError } from "./embeddingProviderErrors";

export type LocalEmbeddingArtifactDtype = "fp32" | "q8" | "q4";

export type LocalEmbeddingArtifactRole = "model-graph" | "model-data" | "tokenizer-json" | "tokenizer-model";

export type LocalEmbeddingArtifactIntegrity = {
  path: string;
  role: LocalEmbeddingArtifactRole;
  sha256: string;
  remoteSizeLabel: string;
  required: boolean;
  dtype?: LocalEmbeddingArtifactDtype;
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
  const requiredRoles = new Set<LocalEmbeddingArtifactRole>();

  for (const artifact of policy.artifacts) {
    if (!artifact.path || !artifact.remoteSizeLabel) {
      throw new LocalEmbeddingProviderError("invalid_manifest", "Embedding artifact policy includes an incomplete artifact");
    }

    if (paths.has(artifact.path)) {
      throw new LocalEmbeddingProviderError("invalid_manifest", "Embedding artifact policy contains duplicate paths");
    }

    paths.add(artifact.path);

    if (artifact.required) {
      requiredRoles.add(artifact.role);
    }

    if ((artifact.role === "model-graph" || artifact.role === "model-data") && artifact.dtype === undefined) {
      throw new LocalEmbeddingProviderError("invalid_manifest", "Embedding model artifacts must declare a dtype");
    }

    if ((artifact.role === "tokenizer-json" || artifact.role === "tokenizer-model") && artifact.dtype !== undefined) {
      throw new LocalEmbeddingProviderError("invalid_manifest", "Embedding tokenizer artifacts must not declare a dtype");
    }

    if (!/^[a-f0-9]{64}$/u.test(artifact.sha256)) {
      throw new LocalEmbeddingProviderError("invalid_manifest", "Embedding artifact SHA-256 must be lowercase hex");
    }
  }

  for (const role of ["model-graph", "model-data", "tokenizer-json", "tokenizer-model"] as const) {
    if (!requiredRoles.has(role)) {
      throw new LocalEmbeddingProviderError(
        "invalid_manifest",
        `Embedding artifact policy is missing a required artifact role: ${role}`
      );
    }
  }
}

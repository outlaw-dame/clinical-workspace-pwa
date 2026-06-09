import { LocalEmbeddingProviderError } from "./embeddingProviderErrors";

export type LocalEmbeddingArtifactDtype = "fp32" | "q8" | "q4";

export type LocalEmbeddingArtifactRole =
  | "model-graph"
  | "model-data"
  | "tokenizer-json"
  | "tokenizer-model"
  | "model-metadata"
  | "tokenizer-metadata";

export type LocalEmbeddingArtifactIntegrity = {
  path: string;
  role: LocalEmbeddingArtifactRole;
  sha256: string;
  remoteSizeLabel: string;
  required: boolean;
  dtype?: LocalEmbeddingArtifactDtype;
};

export type LocalEmbeddingUnpinnedArtifact = {
  path: string;
  role: LocalEmbeddingArtifactRole;
  reason: string;
  required: boolean;
};

export type LocalEmbeddingArtifactIntegrityPolicy = {
  manifestId: string;
  modelId: string;
  revision: string;
  artifacts: readonly LocalEmbeddingArtifactIntegrity[];
  unpinnedArtifacts?: readonly LocalEmbeddingUnpinnedArtifact[];
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

    if (!(artifact.role === "model-graph" || artifact.role === "model-data") && artifact.dtype !== undefined) {
      throw new LocalEmbeddingProviderError("invalid_manifest", "Embedding non-model artifacts must not declare a dtype");
    }

    if (!/^[a-f0-9]{64}$/u.test(artifact.sha256)) {
      throw new LocalEmbeddingProviderError("invalid_manifest", "Embedding artifact SHA-256 must be lowercase hex");
    }
  }

  validateUnpinnedArtifacts(policy.unpinnedArtifacts, paths);

  for (const role of ["model-graph", "model-data", "tokenizer-json", "tokenizer-model"] as const) {
    if (!requiredRoles.has(role)) {
      throw new LocalEmbeddingProviderError(
        "invalid_manifest",
        `Embedding artifact policy is missing a required artifact role: ${role}`
      );
    }
  }
}

function validateUnpinnedArtifacts(
  artifacts: readonly LocalEmbeddingUnpinnedArtifact[] | undefined,
  pinnedPaths: ReadonlySet<string>
): void {
  if (artifacts === undefined) return;

  const unpinnedPaths = new Set<string>();

  for (const artifact of artifacts) {
    if (!artifact.path || !artifact.reason) {
      throw new LocalEmbeddingProviderError("invalid_manifest", "Embedding artifact policy includes incomplete unpinned artifact metadata");
    }

    if (artifact.role !== "model-metadata" && artifact.role !== "tokenizer-metadata") {
      throw new LocalEmbeddingProviderError("invalid_manifest", "Embedding artifact policy includes unsupported unpinned artifact role");
    }

    if (pinnedPaths.has(artifact.path) || unpinnedPaths.has(artifact.path)) {
      throw new LocalEmbeddingProviderError("invalid_manifest", "Embedding artifact policy contains duplicate artifact paths");
    }

    unpinnedPaths.add(artifact.path);
  }
}

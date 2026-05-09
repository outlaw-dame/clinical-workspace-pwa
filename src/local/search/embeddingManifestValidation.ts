import type { LocalEmbeddingModelManifest } from "./embeddingManifest";
import { LocalEmbeddingProviderError } from "./embeddingProviderErrors";

export function assertValidLocalEmbeddingManifest(manifest: LocalEmbeddingModelManifest): void {
  if (!manifest.id || !manifest.modelId || !manifest.revision) {
    throw new LocalEmbeddingProviderError("invalid_manifest", "Embedding manifest is missing required identifiers");
  }

  if (!Number.isInteger(manifest.dimensions) || manifest.dimensions <= 0) {
    throw new LocalEmbeddingProviderError("invalid_manifest", "Embedding manifest dimensions must be a positive integer");
  }

  if (manifest.privacyBoundary !== "local-only") {
    throw new LocalEmbeddingProviderError("invalid_manifest", "Embedding manifest must stay inside the local-only privacy boundary");
  }

  if (manifest.artifactSha256 !== undefined && !/^[a-f0-9]{64}$/u.test(manifest.artifactSha256)) {
    throw new LocalEmbeddingProviderError("invalid_manifest", "Embedding manifest artifact hash must be a lowercase SHA-256 hex digest");
  }
}

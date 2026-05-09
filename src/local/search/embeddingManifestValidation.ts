import type { LocalEmbeddingDtype, LocalEmbeddingModelManifest } from "./embeddingManifest";
import { LocalEmbeddingProviderError } from "./embeddingProviderErrors";

const VALID_DTYPES = new Set<LocalEmbeddingDtype>(["fp32", "q8", "q4"]);

export function assertValidLocalEmbeddingManifest(manifest: LocalEmbeddingModelManifest): void {
  if (!manifest.id || !manifest.modelId || !manifest.revision) {
    throw new LocalEmbeddingProviderError("invalid_manifest", "Embedding manifest is missing required identifiers");
  }

  assertPositiveInteger(manifest.dimensions, "Embedding manifest dimensions must be a positive integer");

  if (manifest.privacyBoundary !== "local-only") {
    throw new LocalEmbeddingProviderError("invalid_manifest", "Embedding manifest must stay inside the local-only privacy boundary");
  }

  if (!manifest.activationState) {
    throw new LocalEmbeddingProviderError("invalid_manifest", "Embedding manifest must declare an activation state");
  }

  if (manifest.artifactSha256 !== undefined && !/^[a-f0-9]{64}$/u.test(manifest.artifactSha256)) {
    throw new LocalEmbeddingProviderError("invalid_manifest", "Embedding manifest artifact hash must be a lowercase SHA-256 hex digest");
  }

  if (manifest.baseDimensions !== undefined) {
    assertPositiveInteger(manifest.baseDimensions, "Embedding manifest base dimensions must be a positive integer");

    if (manifest.dimensions > manifest.baseDimensions) {
      throw new LocalEmbeddingProviderError(
        "invalid_manifest",
        "Embedding manifest dimensions cannot exceed base dimensions"
      );
    }
  }

  if (manifest.supportedDimensions !== undefined) {
    if (manifest.supportedDimensions.length === 0) {
      throw new LocalEmbeddingProviderError("invalid_manifest", "Embedding manifest supported dimensions cannot be empty");
    }

    for (const dimension of manifest.supportedDimensions) {
      assertPositiveInteger(dimension, "Embedding manifest supported dimensions must be positive integers");
    }

    if (!manifest.supportedDimensions.includes(manifest.dimensions)) {
      throw new LocalEmbeddingProviderError(
        "invalid_manifest",
        "Embedding manifest dimensions must be included in supported dimensions"
      );
    }

    if (manifest.baseDimensions !== undefined && !manifest.supportedDimensions.includes(manifest.baseDimensions)) {
      throw new LocalEmbeddingProviderError(
        "invalid_manifest",
        "Embedding manifest base dimensions must be included in supported dimensions"
      );
    }
  }

  if (manifest.defaultDtype !== undefined && !VALID_DTYPES.has(manifest.defaultDtype)) {
    throw new LocalEmbeddingProviderError("invalid_manifest", "Embedding manifest default dtype is not supported");
  }

  if (manifest.fallbackDtypes !== undefined) {
    for (const dtype of manifest.fallbackDtypes) {
      if (!VALID_DTYPES.has(dtype)) {
        throw new LocalEmbeddingProviderError("invalid_manifest", "Embedding manifest fallback dtype is not supported");
      }
    }
  }

  if (manifest.promptPolicy !== undefined) {
    const prompts = [
      manifest.promptPolicy.queryPrefix,
      manifest.promptPolicy.documentTitlePrefix,
      manifest.promptPolicy.documentTextPrefix,
      manifest.promptPolicy.documentSeparator
    ];

    if (prompts.some((prompt) => prompt.length === 0)) {
      throw new LocalEmbeddingProviderError("invalid_manifest", "Embedding manifest prompt policy cannot include empty prompts");
    }
  }
}

function assertPositiveInteger(value: number, message: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new LocalEmbeddingProviderError("invalid_manifest", message);
  }
}

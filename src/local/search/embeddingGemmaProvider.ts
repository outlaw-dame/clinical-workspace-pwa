import { ensureEmbeddingArtifactsVerified } from "./embeddingArtifactCache";
import { getEmbeddingGemma300mArtifactIntegrityPolicy } from "./embeddingGemmaArtifactPolicy";
import { createEmbeddingWithProvider, type LocalEmbeddingInput, type LocalEmbeddingProvider } from "./embeddingProvider";
import { LocalEmbeddingProviderError } from "./embeddingProviderErrors";
import { canUseLocalTransformerWorkerRuntime } from "./embeddingRuntimeCapabilities";
import { createEmbeddingGemmaWorkerEmbedding } from "./embeddingGemmaWorkerClient";
import { assertValidLocalEmbeddingManifest } from "./embeddingManifestValidation";
import { embeddingGemma300mCandidateManifest } from "./localEmbeddingManifests";

let artifactVerificationPromise: Promise<void> | undefined;

export const embeddingGemmaLocalEmbeddingProvider: LocalEmbeddingProvider = {
  id: embeddingGemma300mCandidateManifest.id,
  displayName: embeddingGemma300mCandidateManifest.displayName,
  dimensions: embeddingGemma300mCandidateManifest.dimensions,
  privacyBoundary: "local-only",
  createEmbedding: async ({ text, purpose, signal }: LocalEmbeddingInput) => {
    assertValidLocalEmbeddingManifest(embeddingGemma300mCandidateManifest);

    if (!canUseLocalTransformerWorkerRuntime()) {
      throw new LocalEmbeddingProviderError(
        "unsupported_runtime",
        "EmbeddingGemma requires a local Worker and WebAssembly runtime"
      );
    }

    await ensureEmbeddingGemmaArtifactsVerified(signal);
    return createEmbeddingGemmaWorkerEmbedding(embeddingGemma300mCandidateManifest, text, purpose, signal);
  }
};

export async function createEmbeddingGemmaEmbedding(input: LocalEmbeddingInput): Promise<number[]> {
  return createEmbeddingWithProvider(embeddingGemmaLocalEmbeddingProvider, input);
}

export function resetEmbeddingGemmaArtifactVerificationForTests(): void {
  artifactVerificationPromise = undefined;
}

async function ensureEmbeddingGemmaArtifactsVerified(signal: AbortSignal | undefined): Promise<void> {
  if (artifactVerificationPromise === undefined) {
    artifactVerificationPromise = ensureEmbeddingArtifactsVerified(
      getEmbeddingGemma300mArtifactIntegrityPolicy(),
      signal
    ).then((status) => {
      if (status.state !== "verified") {
        throw new LocalEmbeddingProviderError(
          "artifact_verification_failed",
          "EmbeddingGemma artifacts could not be verified"
        );
      }
    });
  }

  try {
    await artifactVerificationPromise;
  } catch (error) {
    artifactVerificationPromise = undefined;
    throw error;
  }
}

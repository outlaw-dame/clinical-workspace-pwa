import { createEmbeddingWithProvider, type LocalEmbeddingInput, type LocalEmbeddingProvider } from "./embeddingProvider";
import { LocalEmbeddingProviderError } from "./embeddingProviderErrors";
import { canUseLocalTransformerWorkerRuntime } from "./embeddingRuntimeCapabilities";
import { createEmbeddingGemmaWorkerEmbedding } from "./embeddingGemmaWorkerClient";
import { assertValidLocalEmbeddingManifest } from "./embeddingManifestValidation";
import { embeddingGemma300mCandidateManifest } from "./localEmbeddingManifests";

export const embeddingGemmaLocalEmbeddingProvider: LocalEmbeddingProvider = {
  id: embeddingGemma300mCandidateManifest.id,
  displayName: embeddingGemma300mCandidateManifest.displayName,
  dimensions: embeddingGemma300mCandidateManifest.dimensions,
  privacyBoundary: "local-only",
  createEmbedding: ({ text, purpose, signal }: LocalEmbeddingInput) => {
    assertValidLocalEmbeddingManifest(embeddingGemma300mCandidateManifest);

    if (!canUseLocalTransformerWorkerRuntime()) {
      throw new LocalEmbeddingProviderError(
        "unsupported_runtime",
        "EmbeddingGemma requires a local Worker and WebAssembly runtime"
      );
    }

    return createEmbeddingGemmaWorkerEmbedding(embeddingGemma300mCandidateManifest, text, purpose, signal);
  }
};

export async function createEmbeddingGemmaEmbedding(input: LocalEmbeddingInput): Promise<number[]> {
  return createEmbeddingWithProvider(embeddingGemmaLocalEmbeddingProvider, input);
}

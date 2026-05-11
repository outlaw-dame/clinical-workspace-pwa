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
  artifactVerificationPromise ??= runArtifactVerification();

  try {
    await waitForVerificationWithCallerAbort(artifactVerificationPromise, signal);
  } catch (error) {
    if (!isAbortError(error)) {
      artifactVerificationPromise = undefined;
    }
    throw error;
  }
}

async function runArtifactVerification(): Promise<void> {
  const status = await ensureEmbeddingArtifactsVerified(getEmbeddingGemma300mArtifactIntegrityPolicy());

  if (status.state !== "verified") {
    throw new LocalEmbeddingProviderError(
      "artifact_verification_failed",
      "EmbeddingGemma artifacts could not be verified"
    );
  }
}

async function waitForVerificationWithCallerAbort(
  verificationPromise: Promise<void>,
  signal: AbortSignal | undefined
): Promise<void> {
  if (signal === undefined) {
    await verificationPromise;
    return;
  }

  if (signal.aborted) {
    throw createAbortError();
  }

  await new Promise<void>((resolve, reject) => {
    const abortHandler = (): void => {
      signal.removeEventListener("abort", abortHandler);
      reject(createAbortError());
    };

    signal.addEventListener("abort", abortHandler, { once: true });

    void verificationPromise.then(
      () => {
        signal.removeEventListener("abort", abortHandler);
        resolve();
      },
      (error: unknown) => {
        signal.removeEventListener("abort", abortHandler);
        reject(normalizeArtifactVerificationRejection(error));
      }
    );
  });
}

function normalizeArtifactVerificationRejection(error: unknown): Error {
  if (error instanceof Error) return error;
  return new LocalEmbeddingProviderError("artifact_verification_failed", "EmbeddingGemma artifact verification failed");
}

function createAbortError(): LocalEmbeddingProviderError {
  return new LocalEmbeddingProviderError("aborted", "EmbeddingGemma artifact verification was aborted");
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException && error.name === "AbortError" ||
    error instanceof LocalEmbeddingProviderError && error.code === "aborted"
  );
}

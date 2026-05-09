import { describe, expect, it } from "vitest";
import { assertValidLocalEmbeddingManifest } from "./embeddingManifestValidation";
import { LocalEmbeddingProviderError } from "./embeddingProviderErrors";
import {
  deterministicLocalEmbeddingManifest,
  embeddingGemma300mCandidateManifest
} from "./localEmbeddingManifests";

describe("assertValidLocalEmbeddingManifest", () => {
  it("accepts the deterministic fallback manifest", () => {
    expect(() => assertValidLocalEmbeddingManifest(deterministicLocalEmbeddingManifest)).not.toThrow();
  });

  it("accepts the EmbeddingGemma candidate manifest", () => {
    expect(() => assertValidLocalEmbeddingManifest(embeddingGemma300mCandidateManifest)).not.toThrow();
  });

  it("rejects missing identifiers", () => {
    expect(() =>
      assertValidLocalEmbeddingManifest({
        ...deterministicLocalEmbeddingManifest,
        modelId: ""
      })
    ).toThrow(LocalEmbeddingProviderError);
  });

  it("rejects non-positive dimensions", () => {
    expect(() =>
      assertValidLocalEmbeddingManifest({
        ...deterministicLocalEmbeddingManifest,
        dimensions: 0
      })
    ).toThrow("dimensions must be a positive integer");
  });

  it("rejects manifests that leave the local-only privacy boundary", () => {
    expect(() =>
      assertValidLocalEmbeddingManifest({
        ...deterministicLocalEmbeddingManifest,
        privacyBoundary: "remote" as never
      })
    ).toThrow("local-only privacy boundary");
  });

  it("rejects missing activation state", () => {
    expect(() =>
      assertValidLocalEmbeddingManifest({
        ...deterministicLocalEmbeddingManifest,
        activationState: "" as never
      })
    ).toThrow("activation state");
  });

  it("requires lowercase SHA-256 artifact hashes when present", () => {
    expect(() =>
      assertValidLocalEmbeddingManifest({
        ...deterministicLocalEmbeddingManifest,
        artifactSha256: "ABC"
      })
    ).toThrow("lowercase SHA-256");
  });

  it("rejects selected dimensions outside supported dimensions", () => {
    expect(() =>
      assertValidLocalEmbeddingManifest({
        ...embeddingGemma300mCandidateManifest,
        dimensions: 384
      })
    ).toThrow("included in supported dimensions");
  });

  it("rejects selected dimensions larger than base dimensions", () => {
    expect(() =>
      assertValidLocalEmbeddingManifest({
        ...embeddingGemma300mCandidateManifest,
        dimensions: 1024
      })
    ).toThrow("cannot exceed base dimensions");
  });

  it("rejects unsupported dtypes", () => {
    expect(() =>
      assertValidLocalEmbeddingManifest({
        ...embeddingGemma300mCandidateManifest,
        defaultDtype: "int2" as never
      })
    ).toThrow("default dtype");
  });
});

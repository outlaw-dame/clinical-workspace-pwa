import { describe, expect, it } from "vitest";
import { assertValidLocalEmbeddingManifest } from "./embeddingManifestValidation";
import { LocalEmbeddingProviderError } from "./embeddingProviderErrors";
import { deterministicLocalEmbeddingManifest } from "./localEmbeddingManifests";

describe("assertValidLocalEmbeddingManifest", () => {
  it("accepts the deterministic fallback manifest", () => {
    expect(() => assertValidLocalEmbeddingManifest(deterministicLocalEmbeddingManifest)).not.toThrow();
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

  it("requires lowercase SHA-256 artifact hashes when present", () => {
    expect(() =>
      assertValidLocalEmbeddingManifest({
        ...deterministicLocalEmbeddingManifest,
        artifactSha256: "ABC"
      })
    ).toThrow("lowercase SHA-256");
  });
});

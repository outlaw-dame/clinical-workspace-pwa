import { describe, expect, it } from "vitest";
import { assertValidArtifactIntegrityPolicy } from "./embeddingArtifactIntegrity";
import { LocalEmbeddingProviderError } from "./embeddingProviderErrors";
import { embeddingGemma300mArtifactIntegrityPolicy } from "./embeddingGemmaArtifactPolicy";

describe("assertValidArtifactIntegrityPolicy", () => {
  it("accepts the pinned EmbeddingGemma artifact policy", () => {
    expect(() => assertValidArtifactIntegrityPolicy(embeddingGemma300mArtifactIntegrityPolicy)).not.toThrow();
  });

  it("rejects policies with missing identifiers", () => {
    expect(() =>
      assertValidArtifactIntegrityPolicy({ ...embeddingGemma300mArtifactIntegrityPolicy, revision: "" })
    ).toThrow(LocalEmbeddingProviderError);
  });

  it("rejects duplicate artifact paths", () => {
    const [first] = embeddingGemma300mArtifactIntegrityPolicy.artifacts;

    expect(() =>
      assertValidArtifactIntegrityPolicy({
        ...embeddingGemma300mArtifactIntegrityPolicy,
        artifacts: first === undefined ? [] : [first, first]
      })
    ).toThrow("duplicate paths");
  });

  it("rejects invalid artifact hashes", () => {
    const [first, ...rest] = embeddingGemma300mArtifactIntegrityPolicy.artifacts;
    if (first === undefined) throw new Error("missing fixture artifact");

    expect(() =>
      assertValidArtifactIntegrityPolicy({
        ...embeddingGemma300mArtifactIntegrityPolicy,
        artifacts: [{ ...first, sha256: "ABC" }, ...rest]
      })
    ).toThrow("lowercase hex");
  });

  it("requires model artifacts to declare a dtype", () => {
    const [first, ...rest] = embeddingGemma300mArtifactIntegrityPolicy.artifacts;
    if (first === undefined) throw new Error("missing fixture artifact");

    expect(() =>
      assertValidArtifactIntegrityPolicy({
        ...embeddingGemma300mArtifactIntegrityPolicy,
        artifacts: [{ ...first, dtype: undefined }, ...rest]
      })
    ).toThrow("model artifacts must declare a dtype");
  });

  it("rejects dtype declarations on tokenizer artifacts", () => {
    const artifacts = embeddingGemma300mArtifactIntegrityPolicy.artifacts.map((artifact) =>
      artifact.role === "tokenizer-json" ? { ...artifact, dtype: "q4" as const } : artifact
    );

    expect(() =>
      assertValidArtifactIntegrityPolicy({ ...embeddingGemma300mArtifactIntegrityPolicy, artifacts })
    ).toThrow("tokenizer artifacts must not declare a dtype");
  });

  it("requires all runtime-critical artifact roles", () => {
    const artifacts = embeddingGemma300mArtifactIntegrityPolicy.artifacts.filter(
      (artifact) => artifact.role !== "tokenizer-model"
    );

    expect(() =>
      assertValidArtifactIntegrityPolicy({ ...embeddingGemma300mArtifactIntegrityPolicy, artifacts })
    ).toThrow("missing a required artifact role");
  });
});

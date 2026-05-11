import { describe, expect, it } from "vitest";
import {
  canUseEmbeddingArtifactCache,
  createArtifactUrl,
  ensureEmbeddingArtifactsVerified
} from "./embeddingArtifactCache";
import { embeddingGemma300mArtifactIntegrityPolicy } from "./embeddingGemmaArtifactPolicy";

describe("createArtifactUrl", () => {
  it("creates pinned Hugging Face resolve URLs", () => {
    const [artifact] = embeddingGemma300mArtifactIntegrityPolicy.artifacts;
    if (artifact === undefined) throw new Error("missing artifact fixture");

    expect(createArtifactUrl(embeddingGemma300mArtifactIntegrityPolicy, artifact)).toBe(
      `https://huggingface.co/${embeddingGemma300mArtifactIntegrityPolicy.modelId}/resolve/${embeddingGemma300mArtifactIntegrityPolicy.revision}/${artifact.path}`
    );
  });
});

describe("canUseEmbeddingArtifactCache", () => {
  it("returns false in the node test runtime", () => {
    expect(canUseEmbeddingArtifactCache()).toBe(false);
  });
});

describe("ensureEmbeddingArtifactsVerified", () => {
  it("returns an unavailable status when browser artifact cache APIs are unavailable", async () => {
    await expect(ensureEmbeddingArtifactsVerified(embeddingGemma300mArtifactIntegrityPolicy)).resolves.toMatchObject({
      state: "unavailable",
      verifiedCount: 0,
      requiredCount: 4
    });
  });
});

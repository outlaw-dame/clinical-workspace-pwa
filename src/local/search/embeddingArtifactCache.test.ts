import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canUseEmbeddingArtifactCache,
  createArtifactUrl,
  ensureEmbeddingArtifactsVerified,
  isPinnedModelRevisionUrl,
  matchVerifiedEmbeddingArtifactFromCache
} from "./embeddingArtifactCache";
import { embeddingGemma300mArtifactIntegrityPolicy } from "./embeddingGemmaArtifactPolicy";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("createArtifactUrl", () => {
  it("creates pinned Hugging Face resolve URLs", () => {
    const [artifact] = embeddingGemma300mArtifactIntegrityPolicy.artifacts;
    if (artifact === undefined) throw new Error("missing artifact fixture");

    expect(createArtifactUrl(embeddingGemma300mArtifactIntegrityPolicy, artifact)).toBe(
      `https://huggingface.co/${embeddingGemma300mArtifactIntegrityPolicy.modelId}/resolve/${embeddingGemma300mArtifactIntegrityPolicy.revision}/${artifact.path}`
    );
  });
});

describe("isPinnedModelRevisionUrl", () => {
  it("identifies URLs under the pinned model revision", () => {
    expect(
      isPinnedModelRevisionUrl(
        `https://huggingface.co/${embeddingGemma300mArtifactIntegrityPolicy.modelId}/resolve/${embeddingGemma300mArtifactIntegrityPolicy.revision}/config.json`,
        embeddingGemma300mArtifactIntegrityPolicy
      )
    ).toBe(true);
  });

  it("does not match other model revisions", () => {
    expect(
      isPinnedModelRevisionUrl(
        `https://huggingface.co/${embeddingGemma300mArtifactIntegrityPolicy.modelId}/resolve/main/config.json`,
        embeddingGemma300mArtifactIntegrityPolicy
      )
    ).toBe(false);
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

describe("matchVerifiedEmbeddingArtifactFromCache", () => {
  it("fails closed for unpinned files under the pinned model revision", async () => {
    installArtifactCacheGlobals();

    await expect(
      matchVerifiedEmbeddingArtifactFromCache(
        `https://huggingface.co/${embeddingGemma300mArtifactIntegrityPolicy.modelId}/resolve/${embeddingGemma300mArtifactIntegrityPolicy.revision}/config.json`,
        embeddingGemma300mArtifactIntegrityPolicy
      )
    ).rejects.toMatchObject({ code: "artifact_verification_failed" });
  });

  it("ignores non-model URLs so unrelated fetches can proceed normally", async () => {
    installArtifactCacheGlobals();

    await expect(
      matchVerifiedEmbeddingArtifactFromCache("https://example.com/health.json", embeddingGemma300mArtifactIntegrityPolicy)
    ).resolves.toBeUndefined();
  });
});

function installArtifactCacheGlobals(): void {
  vi.stubGlobal("caches", {
    open: vi.fn()
  });
  vi.stubGlobal("fetch", vi.fn());
  vi.stubGlobal("crypto", {
    subtle: {
      digest: vi.fn()
    }
  });
}

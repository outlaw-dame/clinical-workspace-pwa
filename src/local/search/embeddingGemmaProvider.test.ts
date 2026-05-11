import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureEmbeddingArtifactsVerified: vi.fn(),
  createEmbeddingGemmaWorkerEmbedding: vi.fn(),
  canUseLocalTransformerWorkerRuntime: vi.fn()
}));

vi.mock("./embeddingArtifactCache", () => ({
  ensureEmbeddingArtifactsVerified: mocks.ensureEmbeddingArtifactsVerified
}));

vi.mock("./embeddingGemmaWorkerClient", () => ({
  createEmbeddingGemmaWorkerEmbedding: mocks.createEmbeddingGemmaWorkerEmbedding
}));

vi.mock("./embeddingRuntimeCapabilities", () => ({
  canUseLocalTransformerWorkerRuntime: mocks.canUseLocalTransformerWorkerRuntime
}));

describe("embeddingGemmaLocalEmbeddingProvider", () => {
  beforeEach(async () => {
    vi.resetModules();
    mocks.ensureEmbeddingArtifactsVerified.mockReset();
    mocks.createEmbeddingGemmaWorkerEmbedding.mockReset();
    mocks.canUseLocalTransformerWorkerRuntime.mockReset();
    mocks.canUseLocalTransformerWorkerRuntime.mockReturnValue(true);
    mocks.ensureEmbeddingArtifactsVerified.mockResolvedValue({
      modelId: "onnx-community/embeddinggemma-300m-ONNX",
      revision: "75a84c732f1884df76bec365346230e32f582c82",
      state: "verified",
      verifiedCount: 4,
      requiredCount: 4,
      failedArtifactPaths: [],
      updatedAt: "2026-05-11T00:00:00.000Z"
    });
    mocks.createEmbeddingGemmaWorkerEmbedding.mockResolvedValue([1, 0, 0]);

    const module = await import("./embeddingGemmaProvider");
    module.resetEmbeddingGemmaArtifactVerificationForTests();
  });

  it("memoizes artifact verification across embedding calls", async () => {
    const { embeddingGemmaLocalEmbeddingProvider } = await import("./embeddingGemmaProvider");

    await embeddingGemmaLocalEmbeddingProvider.createEmbedding({ text: "sleep", purpose: "query" });
    await embeddingGemmaLocalEmbeddingProvider.createEmbedding({ text: "stress", purpose: "query" });

    expect(mocks.ensureEmbeddingArtifactsVerified).toHaveBeenCalledTimes(1);
    expect(mocks.ensureEmbeddingArtifactsVerified).toHaveBeenCalledWith(expect.any(Object));
    expect(mocks.createEmbeddingGemmaWorkerEmbedding).toHaveBeenCalledTimes(2);
  });

  it("does not pass caller abort signals into shared verification", async () => {
    const { embeddingGemmaLocalEmbeddingProvider } = await import("./embeddingGemmaProvider");
    const controller = new AbortController();

    await embeddingGemmaLocalEmbeddingProvider.createEmbedding({
      text: "sleep",
      purpose: "query",
      signal: controller.signal
    });

    expect(mocks.ensureEmbeddingArtifactsVerified).toHaveBeenCalledWith(expect.any(Object));
    expect(mocks.ensureEmbeddingArtifactsVerified.mock.calls[0]?.[1]).toBeUndefined();
  });
});

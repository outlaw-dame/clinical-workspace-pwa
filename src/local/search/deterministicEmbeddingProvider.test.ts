import { describe, expect, it } from "vitest";
import { deterministicLocalEmbeddingProvider } from "./deterministicEmbeddingProvider";
import { LOCAL_EMBEDDING_DIMENSIONS, LOCAL_EMBEDDING_MODEL } from "./searchConfig";

describe("deterministicLocalEmbeddingProvider", () => {
  it("exposes local-only provider metadata", () => {
    expect(deterministicLocalEmbeddingProvider.id).toBe(LOCAL_EMBEDDING_MODEL);
    expect(deterministicLocalEmbeddingProvider.dimensions).toBe(LOCAL_EMBEDDING_DIMENSIONS);
    expect(deterministicLocalEmbeddingProvider.privacyBoundary).toBe("local-only");
  });

  it("normalizes query text before embedding", async () => {
    const directQueryEmbedding = await deterministicLocalEmbeddingProvider.createEmbedding({
      text: "Sleep\n\tStress",
      purpose: "query"
    });
    const normalizedDocumentEmbedding = await deterministicLocalEmbeddingProvider.createEmbedding({
      text: "sleep stress",
      purpose: "document"
    });

    expect(directQueryEmbedding).toEqual(normalizedDocumentEmbedding);
  });

  it("supports cancellation before token processing", () => {
    const controller = new AbortController();
    controller.abort();

    expect(() =>
      deterministicLocalEmbeddingProvider.createEmbedding({
        text: "sleep stress",
        purpose: "document",
        signal: controller.signal
      })
    ).toThrow("Local embedding generation was aborted");
  });
});

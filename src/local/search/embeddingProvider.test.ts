import { describe, expect, it } from "vitest";
import {
  LocalEmbeddingAbortError,
  createEmbeddingWithProvider,
  isLocalEmbeddingAbortError,
  serializeEmbeddingForPgVector,
  type LocalEmbeddingProvider
} from "./embeddingProvider";

const provider: LocalEmbeddingProvider = {
  id: "test-provider",
  displayName: "Test provider",
  dimensions: 3,
  privacyBoundary: "local-only",
  createEmbedding: () => [1, 0, 0]
};

describe("createEmbeddingWithProvider", () => {
  it("returns embeddings from the provider when dimensions match", async () => {
    await expect(
      createEmbeddingWithProvider(provider, {
        text: "clinical note",
        purpose: "document"
      })
    ).resolves.toEqual([1, 0, 0]);
  });

  it("rejects providers that return mismatched dimensions", async () => {
    await expect(
      createEmbeddingWithProvider(
        {
          ...provider,
          createEmbedding: () => [1, 0]
        },
        {
          text: "clinical note",
          purpose: "document"
        }
      )
    ).rejects.toThrow("returned 2 dimensions; expected 3");
  });

  it("aborts before invoking the provider when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    const error = await createEmbeddingWithProvider(provider, {
      text: "clinical note",
      purpose: "document",
      signal: controller.signal
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(LocalEmbeddingAbortError);
    expect(isLocalEmbeddingAbortError(error)).toBe(true);
  });

  it("aborts after provider work if the signal is aborted before validation completes", async () => {
    const controller = new AbortController();

    const error = await createEmbeddingWithProvider(
      {
        ...provider,
        createEmbedding: () => {
          controller.abort();
          return [1, 0, 0];
        }
      },
      {
        text: "clinical note",
        purpose: "document",
        signal: controller.signal
      }
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(LocalEmbeddingAbortError);
  });
});

describe("serializeEmbeddingForPgVector", () => {
  it("serializes vectors using bounded decimal precision", () => {
    expect(serializeEmbeddingForPgVector([0.1234567, 0, 1], 3)).toBe("[0.123457,0,1]");
  });

  it("rejects mismatched dimensions", () => {
    expect(() => serializeEmbeddingForPgVector([1, 0], 3)).toThrow("Local embedding dimensions");
  });
});

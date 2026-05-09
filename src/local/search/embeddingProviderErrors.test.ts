import { describe, expect, it } from "vitest";
import {
  LocalEmbeddingProviderError,
  normalizeLocalEmbeddingProviderError
} from "./embeddingProviderErrors";

describe("normalizeLocalEmbeddingProviderError", () => {
  it("preserves existing provider errors", () => {
    const error = new LocalEmbeddingProviderError("model_not_loaded", "Model is not loaded");

    expect(normalizeLocalEmbeddingProviderError(error)).toBe(error);
  });

  it("normalizes unknown errors without exposing raw input text", () => {
    const normalized = normalizeLocalEmbeddingProviderError(new Error("raw clinical text should not be propagated"));

    expect(normalized.code).toBe("inference_failed");
    expect(normalized.message).toBe("Local embedding provider failed");
  });
});

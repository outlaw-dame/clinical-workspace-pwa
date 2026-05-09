import { describe, expect, it } from "vitest";
import { isLocalEmbeddingWorkerResponse } from "./embeddingWorkerProtocol";

describe("isLocalEmbeddingWorkerResponse", () => {
  it("accepts typed model lifecycle responses with request ids", () => {
    expect(
      isLocalEmbeddingWorkerResponse({
        type: "model-loaded",
        requestId: "request-1",
        manifestId: "manifest-1"
      })
    ).toBe(true);

    expect(
      isLocalEmbeddingWorkerResponse({
        type: "model-disposed",
        requestId: "request-2",
        manifestId: "manifest-1"
      })
    ).toBe(true);
  });

  it("accepts embedding-created responses with finite numeric embeddings", () => {
    expect(
      isLocalEmbeddingWorkerResponse({
        type: "embedding-created",
        requestId: "request-1",
        manifestId: "manifest-1",
        embedding: [1, 0, 0.25]
      })
    ).toBe(true);
  });

  it("accepts embedding-error responses with known error codes", () => {
    expect(
      isLocalEmbeddingWorkerResponse({
        type: "embedding-error",
        requestId: "request-1",
        code: "aborted",
        message: "Local embedding generation was aborted"
      })
    ).toBe(true);
  });

  it("rejects non-object values", () => {
    expect(isLocalEmbeddingWorkerResponse(null)).toBe(false);
    expect(isLocalEmbeddingWorkerResponse("model-loaded")).toBe(false);
  });

  it("rejects responses without string request ids", () => {
    expect(
      isLocalEmbeddingWorkerResponse({
        type: "model-loaded",
        requestId: 123,
        manifestId: "manifest-1"
      })
    ).toBe(false);
  });

  it("rejects unknown response types", () => {
    expect(
      isLocalEmbeddingWorkerResponse({
        type: "unknown-response",
        requestId: "request-1",
        manifestId: "manifest-1"
      })
    ).toBe(false);
  });

  it("rejects embedding-created responses without valid embeddings", () => {
    expect(
      isLocalEmbeddingWorkerResponse({
        type: "embedding-created",
        requestId: "request-1",
        manifestId: "manifest-1"
      })
    ).toBe(false);

    expect(
      isLocalEmbeddingWorkerResponse({
        type: "embedding-created",
        requestId: "request-1",
        manifestId: "manifest-1",
        embedding: [1, Number.NaN]
      })
    ).toBe(false);
  });

  it("rejects embedding-error responses with unknown error codes", () => {
    expect(
      isLocalEmbeddingWorkerResponse({
        type: "embedding-error",
        requestId: "request-1",
        code: "raw-error",
        message: "Raw error"
      })
    ).toBe(false);
  });
});

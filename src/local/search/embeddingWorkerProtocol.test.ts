import { describe, expect, it } from "vitest";
import { isLocalEmbeddingWorkerResponse } from "./embeddingWorkerProtocol";

describe("isLocalEmbeddingWorkerResponse", () => {
  it("accepts typed worker responses with request ids", () => {
    expect(
      isLocalEmbeddingWorkerResponse({
        type: "model-loaded",
        requestId: "request-1",
        manifestId: "manifest-1"
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
});

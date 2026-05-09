import { describe, expect, it } from "vitest";
import { createLocalEmbedding, toPgVector } from "./embeddingModelRegistry";
import { LOCAL_EMBEDDING_DIMENSIONS } from "./searchConfig";

describe("createLocalEmbedding", () => {
  it("creates stable normalized vectors with configured dimensions", () => {
    const first = createLocalEmbedding("sleep medication stress");
    const second = createLocalEmbedding("sleep medication stress");

    expect(first).toHaveLength(LOCAL_EMBEDDING_DIMENSIONS);
    expect(second).toEqual(first);

    const magnitude = Math.sqrt(first.reduce((sum, value) => sum + value * value, 0));
    expect(magnitude).toBeCloseTo(1, 5);
  });

  it("returns an all-zero vector for empty searchable text", () => {
    expect(createLocalEmbedding(" ")).toEqual(new Array<number>(LOCAL_EMBEDDING_DIMENSIONS).fill(0));
  });
});

describe("toPgVector", () => {
  it("serializes configured vectors for pgvector", () => {
    const vector = new Array<number>(LOCAL_EMBEDDING_DIMENSIONS).fill(0);
    vector[0] = 1;

    expect(toPgVector(vector).startsWith("[1,")).toBe(true);
    expect(toPgVector(vector).endsWith("]")).toBe(true);
  });

  it("rejects vectors with mismatched dimensions", () => {
    expect(() => toPgVector([1, 2, 3])).toThrow("Local embedding dimensions");
  });
});

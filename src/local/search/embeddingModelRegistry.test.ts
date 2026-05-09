import { describe, expect, it } from "vitest";
import {
  createDocumentEmbedding,
  createLocalEmbedding,
  createQueryEmbeddingWithProvider,
  getActiveLocalEmbeddingProvider,
  toPgVector
} from "./embeddingModelRegistry";
import { getActiveLocalEmbeddingManifest } from "./localEmbeddingManifests";
import { LOCAL_EMBEDDING_DIMENSIONS, LOCAL_EMBEDDING_MODEL } from "./searchConfig";

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

describe("embedding provider facade", () => {
  it("exposes the active local embedding provider metadata", () => {
    const provider = getActiveLocalEmbeddingProvider();

    expect(provider.id).toBe(LOCAL_EMBEDDING_MODEL);
    expect(provider.dimensions).toBe(LOCAL_EMBEDDING_DIMENSIONS);
    expect(provider.privacyBoundary).toBe("local-only");
  });

  it("exposes the active deterministic fallback manifest before model selection", () => {
    const manifest = getActiveLocalEmbeddingManifest();

    expect(manifest.id).toBe(LOCAL_EMBEDDING_MODEL);
    expect(manifest.runtime).toBe("deterministic-token-hash");
    expect(manifest.quality).toBe("fallback");
    expect(manifest.artifactSource).toBe("bundled");
    expect(manifest.privacyBoundary).toBe("local-only");
  });

  it("creates document embeddings through the active provider", async () => {
    const embedding = await createDocumentEmbedding("sleep medication stress");

    expect(embedding).toHaveLength(LOCAL_EMBEDDING_DIMENSIONS);
  });

  it("creates normalized query embeddings through the active provider", async () => {
    const queryEmbedding = await createQueryEmbeddingWithProvider("Sleep\n\tStress");
    const documentEmbedding = await createDocumentEmbedding("sleep stress");

    expect(queryEmbedding).toEqual(documentEmbedding);
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

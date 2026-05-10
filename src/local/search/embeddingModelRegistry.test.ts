import { describe, expect, it } from "vitest";
import {
  createDocumentEmbedding,
  createLocalEmbedding,
  createQueryEmbeddingWithProvider,
  fallbackLocalEmbeddingProvider,
  getActiveLocalEmbeddingProvider,
  preferredLocalEmbeddingProvider,
  toPgVector
} from "./embeddingModelRegistry";
import {
  EMBEDDINGGEMMA_CANDIDATE_MODEL_ID,
  EMBEDDINGGEMMA_SELECTED_DIMENSIONS,
  getActiveLocalEmbeddingManifest,
  getCandidateLocalEmbeddingManifests,
  getFallbackLocalEmbeddingManifest
} from "./localEmbeddingManifests";
import { LOCAL_EMBEDDING_DIMENSIONS, LOCAL_EMBEDDING_MODEL } from "./searchConfig";

describe("createLocalEmbedding", () => {
  it("creates stable normalized fallback vectors with configured dimensions", () => {
    const first = createLocalEmbedding("sleep medication stress");
    const second = createLocalEmbedding("sleep medication stress");

    expect(first).toHaveLength(LOCAL_EMBEDDING_DIMENSIONS);
    expect(second).toEqual(first);

    const magnitude = Math.sqrt(first.reduce((sum, value) => sum + value * value, 0));
    expect(magnitude).toBeCloseTo(1, 5);
  });

  it("returns an all-zero vector for empty searchable fallback text", () => {
    expect(createLocalEmbedding(" ")).toEqual(new Array<number>(LOCAL_EMBEDDING_DIMENSIONS).fill(0));
  });
});

describe("embedding provider facade", () => {
  it("prefers EmbeddingGemma when local worker runtime support is available", () => {
    expect(preferredLocalEmbeddingProvider.id).toBe("embeddinggemma-300m-onnx-q4-256d-candidate");
    expect(preferredLocalEmbeddingProvider.dimensions).toBe(EMBEDDINGGEMMA_SELECTED_DIMENSIONS);
    expect(preferredLocalEmbeddingProvider.privacyBoundary).toBe("local-only");
  });

  it("keeps deterministic embeddings as the fallback provider", () => {
    expect(fallbackLocalEmbeddingProvider.id).toBe(LOCAL_EMBEDDING_MODEL);
    expect(fallbackLocalEmbeddingProvider.dimensions).toBe(LOCAL_EMBEDDING_DIMENSIONS);
    expect(getFallbackLocalEmbeddingManifest().activationState).toBe("fallback");
  });

  it("falls back to deterministic embeddings in the Node test runtime", () => {
    const provider = getActiveLocalEmbeddingProvider();

    expect(provider.id).toBe(LOCAL_EMBEDDING_MODEL);
    expect(provider.dimensions).toBe(LOCAL_EMBEDDING_DIMENSIONS);
  });

  it("exposes EmbeddingGemma as the active manifest", () => {
    const manifest = getActiveLocalEmbeddingManifest();

    expect(manifest.modelId).toBe(EMBEDDINGGEMMA_CANDIDATE_MODEL_ID);
    expect(manifest.dimensions).toBe(EMBEDDINGGEMMA_SELECTED_DIMENSIONS);
    expect(manifest.runtime).toBe("local-transformer-worker");
    expect(manifest.quality).toBe("candidate");
    expect(manifest.activationState).toBe("active");
    expect(manifest.privacyBoundary).toBe("local-only");
  });

  it("keeps EmbeddingGemma listed in candidate manifests for diagnostics", () => {
    const [candidate] = getCandidateLocalEmbeddingManifests();

    expect(candidate?.modelId).toBe(EMBEDDINGGEMMA_CANDIDATE_MODEL_ID);
    expect(candidate?.dimensions).toBe(EMBEDDINGGEMMA_SELECTED_DIMENSIONS);
    expect(candidate?.activationState).toBe("active");
  });

  it("creates document embeddings through the resolved provider", async () => {
    const embedding = await createDocumentEmbedding("sleep medication stress");

    expect(embedding).toHaveLength(LOCAL_EMBEDDING_DIMENSIONS);
  });

  it("creates normalized query embeddings through the resolved provider", async () => {
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

  it("rejects vectors with mismatched explicit dimensions", () => {
    expect(() => toPgVector([1, 2, 3], LOCAL_EMBEDDING_DIMENSIONS)).toThrow("Local embedding dimensions");
  });
});

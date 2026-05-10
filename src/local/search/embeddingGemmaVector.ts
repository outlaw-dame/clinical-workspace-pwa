import { normalizeEmbeddingVector } from "./embeddingProvider";
import {
  EMBEDDINGGEMMA_BASE_DIMENSIONS,
  EMBEDDINGGEMMA_SELECTED_DIMENSIONS
} from "./localEmbeddingManifests";

export function truncateEmbeddingGemmaVector(
  embedding: readonly number[],
  dimensions = EMBEDDINGGEMMA_SELECTED_DIMENSIONS
): number[] {
  if (embedding.length !== EMBEDDINGGEMMA_BASE_DIMENSIONS) {
    throw new Error(`EmbeddingGemma returned ${embedding.length} dimensions; expected ${EMBEDDINGGEMMA_BASE_DIMENSIONS}`);
  }

  if (!Number.isInteger(dimensions) || dimensions <= 0 || dimensions > embedding.length) {
    throw new Error("EmbeddingGemma truncation dimensions are invalid");
  }

  return normalizeEmbeddingVector(embedding.slice(0, dimensions));
}

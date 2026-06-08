import type { LocalEmbeddingUnpinnedArtifact } from "./embeddingArtifactIntegrity";

const UNPINNED_METADATA_REASON = "Required by Transformers.js loading; SHA-256 is not pinned yet.";

export const embeddingGemma300mUnpinnedArtifacts = [
  { path: "config.json", role: "model-metadata", reason: UNPINNED_METADATA_REASON, required: true },
  { path: "generation_config.json", role: "model-metadata", reason: UNPINNED_METADATA_REASON, required: true },
  { path: "tokenizer_config.json", role: "tokenizer-metadata", reason: UNPINNED_METADATA_REASON, required: true },
  { path: "special_tokens_map.json", role: "tokenizer-metadata", reason: UNPINNED_METADATA_REASON, required: true },
  { path: "added_tokens.json", role: "tokenizer-metadata", reason: UNPINNED_METADATA_REASON, required: true }
] as const satisfies readonly LocalEmbeddingUnpinnedArtifact[];

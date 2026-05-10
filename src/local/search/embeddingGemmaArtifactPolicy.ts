import {
  assertValidArtifactIntegrityPolicy,
  type LocalEmbeddingArtifactIntegrityPolicy
} from "./embeddingArtifactIntegrity";
import {
  EMBEDDINGGEMMA_CANDIDATE_MODEL_ID,
  embeddingGemma300mCandidateManifest
} from "./localEmbeddingManifests";

export const EMBEDDINGGEMMA_PINNED_REVISION = "75a84c732f1884df76bec365346230e32f582c82";

export const embeddingGemma300mArtifactIntegrityPolicy: LocalEmbeddingArtifactIntegrityPolicy = {
  manifestId: embeddingGemma300mCandidateManifest.id,
  modelId: EMBEDDINGGEMMA_CANDIDATE_MODEL_ID,
  revision: EMBEDDINGGEMMA_PINNED_REVISION,
  artifacts: [
    {
      path: "onnx/model_q4.onnx",
      role: "model-graph",
      dtype: "q4",
      sha256: "ad1dfee81a70f7944b9b9d1cc6e48075b832881cf33fab2f2b248be78f3f0043",
      remoteSizeLabel: "519 kB",
      required: true
    },
    {
      path: "onnx/model_q4.onnx_data",
      role: "model-data",
      dtype: "q4",
      sha256: "599962c3143b040de2dd05e5975be3e9091dd067cacc6a8f7186e3203bab9e02",
      remoteSizeLabel: "197 MB",
      required: true
    },
    {
      path: "tokenizer.json",
      role: "tokenizer-json",
      sha256: "4dda02faaf32bc91031dc8c88457ac272b00c1016cc679757d1c441b248b9c47",
      remoteSizeLabel: "20.3 MB",
      required: true
    },
    {
      path: "tokenizer.model",
      role: "tokenizer-model",
      sha256: "1299c11d7cf632ef3b4e11937501358ada021bbdf7c47638d13c0ee982f2e79c",
      remoteSizeLabel: "4.69 MB",
      required: true
    }
  ]
};

export function getEmbeddingGemma300mArtifactIntegrityPolicy(): LocalEmbeddingArtifactIntegrityPolicy {
  assertValidArtifactIntegrityPolicy(embeddingGemma300mArtifactIntegrityPolicy);
  return embeddingGemma300mArtifactIntegrityPolicy;
}

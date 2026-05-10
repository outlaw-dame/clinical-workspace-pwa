import { createEmbeddingDocumentPrompt, createEmbeddingQueryPrompt } from "./embeddingPromptPolicy";
import { LocalEmbeddingProviderError, normalizeLocalEmbeddingProviderError } from "./embeddingProviderErrors";
import { truncateEmbeddingGemmaVector } from "./embeddingGemmaVector";
import type { LocalEmbeddingModelManifest } from "./embeddingManifest";
import type { LocalEmbeddingWorkerRequest, LocalEmbeddingWorkerResponse } from "./embeddingWorkerProtocol";

type TensorLike = {
  tolist: () => unknown;
};

type Tokenizer = (texts: string[], options: { padding: boolean }) => Promise<unknown>;

type Model = (inputs: unknown) => Promise<{ sentence_embedding?: TensorLike }>;

type TransformersModule = {
  AutoTokenizer: {
    from_pretrained: (modelId: string, options?: Record<string, unknown>) => Promise<Tokenizer>;
  };
  AutoModel: {
    from_pretrained: (modelId: string, options?: Record<string, unknown>) => Promise<Model>;
  };
};

type LoadedModel = {
  manifest: LocalEmbeddingModelManifest;
  tokenizer: Tokenizer;
  model: Model;
};

let loadedModel: LoadedModel | undefined;
let loadingModelPromise: Promise<LoadedModel> | undefined;

self.addEventListener("message", (event: MessageEvent<LocalEmbeddingWorkerRequest>) => {
  void handleWorkerRequest(event.data);
});

async function handleWorkerRequest(request: LocalEmbeddingWorkerRequest): Promise<void> {
  try {
    switch (request.type) {
      case "load-model": {
        const model = await loadModel(request.manifest);
        postResponse({ type: "model-loaded", requestId: request.requestId, manifestId: model.manifest.id });
        return;
      }
      case "create-embedding": {
        const model = await getLoadedModel(request.manifestId);
        const prompt =
          request.purpose === "query"
            ? createEmbeddingQueryPrompt(model.manifest, request.text)
            : createEmbeddingDocumentPrompt(model.manifest, { text: request.text });
        const inputs = await model.tokenizer([prompt], { padding: true });
        const outputs = await model.model(inputs);
        const embedding = extractSentenceEmbedding(outputs.sentence_embedding);
        postResponse({
          type: "embedding-created",
          requestId: request.requestId,
          manifestId: model.manifest.id,
          embedding: truncateEmbeddingGemmaVector(embedding, model.manifest.dimensions)
        });
        return;
      }
      case "dispose-model": {
        if (loadedModel?.manifest.id === request.manifestId) {
          loadedModel = undefined;
          loadingModelPromise = undefined;
        }
        postResponse({ type: "model-disposed", requestId: request.requestId, manifestId: request.manifestId });
        return;
      }
    }
  } catch (error) {
    const normalized = normalizeLocalEmbeddingProviderError(error);
    postResponse({
      type: "embedding-error",
      requestId: request.requestId,
      code: normalized.code,
      message: normalized.message
    });
  }
}

async function getLoadedModel(manifestId: string): Promise<LoadedModel> {
  if (loadedModel?.manifest.id === manifestId) return loadedModel;
  throw new LocalEmbeddingProviderError("model_not_loaded", "EmbeddingGemma model is not loaded");
}

async function loadModel(manifest: LocalEmbeddingModelManifest): Promise<LoadedModel> {
  if (loadedModel?.manifest.id === manifest.id) return loadedModel;
  loadingModelPromise ??= loadModelOnce(manifest);
  loadedModel = await loadingModelPromise;
  return loadedModel;
}

async function loadModelOnce(manifest: LocalEmbeddingModelManifest): Promise<LoadedModel> {
  try {
    const transformers = (await import("@huggingface/transformers")) as unknown as TransformersModule;
    const options = {
      revision: manifest.revision,
      dtype: manifest.defaultDtype ?? "q4"
    };
    const [tokenizer, model] = await Promise.all([
      transformers.AutoTokenizer.from_pretrained(manifest.modelId, { revision: manifest.revision }),
      transformers.AutoModel.from_pretrained(manifest.modelId, options)
    ]);

    return { manifest, tokenizer, model };
  } catch (_error) {
    loadingModelPromise = undefined;
    throw new LocalEmbeddingProviderError("model_load_failed", "EmbeddingGemma model failed to load");
  }
}

function extractSentenceEmbedding(sentenceEmbedding: TensorLike | undefined): number[] {
  if (sentenceEmbedding === undefined) {
    throw new LocalEmbeddingProviderError("inference_failed", "EmbeddingGemma output did not include sentence embeddings");
  }

  const value = sentenceEmbedding.tolist();
  const firstEmbedding = Array.isArray(value) ? value[0] : undefined;

  if (!Array.isArray(firstEmbedding)) {
    throw new LocalEmbeddingProviderError("inference_failed", "EmbeddingGemma output shape was invalid");
  }

  return firstEmbedding.map((item) => {
    if (typeof item !== "number" || !Number.isFinite(item)) {
      throw new LocalEmbeddingProviderError("inference_failed", "EmbeddingGemma output contained invalid numbers");
    }
    return item;
  });
}

function postResponse(response: LocalEmbeddingWorkerResponse): void {
  self.postMessage(response);
}

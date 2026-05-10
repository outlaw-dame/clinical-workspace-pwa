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
let loadingManifestId: string | undefined;

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
        const model = getLoadedModel(request.manifestId);
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
        }
        if (loadingManifestId === request.manifestId) {
          loadingModelPromise = undefined;
          loadingManifestId = undefined;
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

function getLoadedModel(manifestId: string): LoadedModel {
  if (loadedModel?.manifest.id === manifestId) return loadedModel;
  throw new LocalEmbeddingProviderError("model_not_loaded", "EmbeddingGemma model is not loaded");
}

async function loadModel(manifest: LocalEmbeddingModelManifest): Promise<LoadedModel> {
  if (loadedModel?.manifest.id === manifest.id) return loadedModel;

  if (loadingManifestId !== manifest.id || loadingModelPromise === undefined) {
    loadingModelPromise = loadModelOnce(manifest);
    loadingManifestId = manifest.id;
  }

  const model = await loadingModelPromise;
  loadedModel = model;
  loadingModelPromise = undefined;
  loadingManifestId = undefined;
  return model;
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
  } catch {
    loadingModelPromise = undefined;
    loadingManifestId = undefined;
    throw new LocalEmbeddingProviderError("model_load_failed", "EmbeddingGemma model failed to load");
  }
}

function extractSentenceEmbedding(sentenceEmbedding: TensorLike | undefined): number[] {
  if (sentenceEmbedding === undefined) {
    throw new LocalEmbeddingProviderError("inference_failed", "EmbeddingGemma output did not include sentence embeddings");
  }

  const firstEmbedding = getFirstEmbedding(sentenceEmbedding.tolist());

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

function getFirstEmbedding(value: unknown): unknown {
  if (!Array.isArray(value)) return undefined;
  return value.at(0);
}

function postResponse(response: LocalEmbeddingWorkerResponse): void {
  self.postMessage(response);
}

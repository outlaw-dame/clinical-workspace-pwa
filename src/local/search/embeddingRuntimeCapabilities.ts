export type LocalEmbeddingRuntimeCapabilities = {
  webWorker: boolean;
  webAssembly: boolean;
  webGpu: boolean;
};

export function detectLocalEmbeddingRuntimeCapabilities(): LocalEmbeddingRuntimeCapabilities {
  return {
    webWorker: typeof Worker !== "undefined",
    webAssembly: typeof WebAssembly !== "undefined",
    webGpu: typeof navigator !== "undefined" && "gpu" in navigator
  };
}

export function canUseLocalTransformerWorkerRuntime(
  capabilities = detectLocalEmbeddingRuntimeCapabilities()
): boolean {
  return capabilities.webWorker && capabilities.webAssembly;
}

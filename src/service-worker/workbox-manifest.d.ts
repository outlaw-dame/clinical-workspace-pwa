/// <reference lib="webworker" />

declare interface ServiceWorkerGlobalScope {
  __WB_MANIFEST: Array<{ revision: string | null; url: string }>;
}

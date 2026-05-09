/// <reference lib="webworker" />

import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { CacheFirst, NetworkOnly, StaleWhileRevalidate } from "workbox-strategies";

type WorkboxManifestEntry = { revision: string | null; url: string };
type SkipWaitingMessage = { type: "SKIP_WAITING" };

declare const self: ServiceWorkerGlobalScope &
  typeof globalThis & {
    __WB_MANIFEST: WorkboxManifestEntry[];
  };

// Vite injects the app-shell asset manifest here at build time.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

registerRoute(
  ({ request }) => request.destination === "style" || request.destination === "script",
  new StaleWhileRevalidate({ cacheName: "app-shell-assets" })
);

registerRoute(
  ({ request }) =>
    request.destination === "image" ||
    request.destination === "font" ||
    request.destination === "manifest",
  new CacheFirst({ cacheName: "static-assets" })
);

registerRoute(
  ({ url }) =>
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/app/share-target") ||
    url.pathname.startsWith("/decrypted/"),
  new NetworkOnly()
);

self.addEventListener("message", (event: ExtendableMessageEvent) => {
  if (isSkipWaitingMessage(event.data)) {
    void self.skipWaiting();
  }
});

function isSkipWaitingMessage(data: unknown): data is SkipWaitingMessage {
  if (typeof data !== "object" || data === null || !("type" in data)) {
    return false;
  }

  return (data as { type?: unknown }).type === "SKIP_WAITING";
}

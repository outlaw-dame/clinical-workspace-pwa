/// <reference lib="webworker" />

import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { CacheFirst, NetworkOnly, StaleWhileRevalidate } from "workbox-strategies";

type WorkboxManifestEntry = { revision: string | null; url: string };
type WorkspaceServiceWorkerScope = ServiceWorkerGlobalScope &
  typeof globalThis & {
    __WB_MANIFEST: WorkboxManifestEntry[];
  };

const serviceWorker = self as unknown as WorkspaceServiceWorkerScope;

// Vite injects the app-shell asset manifest here at build time.
precacheAndRoute(serviceWorker.__WB_MANIFEST);
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

serviceWorker.addEventListener("message", (event: ExtendableMessageEvent) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    void serviceWorker.skipWaiting();
  }
});

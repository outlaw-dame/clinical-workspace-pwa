/// <reference lib="webworker" />

import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { CacheFirst, NetworkOnly, StaleWhileRevalidate } from "workbox-strategies";

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

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

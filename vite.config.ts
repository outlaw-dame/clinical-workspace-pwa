import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    solid(),
    VitePWA({
      registerType: "autoUpdate",
      strategies: "injectManifest",
      srcDir: "src/service-worker",
      filename: "sw.ts",
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest}"]
      },
      manifest: {
        name: "Clinical Workspace",
        short_name: "Workspace",
        description:
          "Secure local-first workspace for chat, notes, tasks, calendar, and documents.",
        start_url: "/app",
        scope: "/",
        display: "standalone",
        display_override: ["window-controls-overlay", "standalone", "browser"],
        orientation: "portrait-primary",
        theme_color: "#f7f7f8",
        background_color: "#f7f7f8",
        categories: ["productivity", "medical", "business"],
        icons: [
          {
            src: "/icons/icon-192.svg",
            sizes: "192x192",
            type: "image/svg+xml",
            purpose: "any"
          },
          {
            src: "/icons/icon-512.svg",
            sizes: "512x512",
            type: "image/svg+xml",
            purpose: "any maskable"
          }
        ],
        shortcuts: [
          { name: "New Message", url: "/app/chat/new" },
          { name: "New Note", url: "/app/notes/new" },
          { name: "Today", url: "/app/today" }
        ],
        share_target: {
          action: "/app/share-target",
          method: "POST",
          enctype: "multipart/form-data",
          params: {
            title: "title",
            text: "text",
            url: "url",
            files: [
              {
                name: "files",
                accept: [
                  "application/pdf",
                  "image/*",
                  "text/plain",
                  "application/msword",
                  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                ]
              }
            ]
          }
        }
      }
    })
  ],
  worker: {
    format: "es"
  },
  server: {
    strictPort: true,
    port: 5173
  },
  preview: {
    strictPort: true,
    port: 4173
  }
});

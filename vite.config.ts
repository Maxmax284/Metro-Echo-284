import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    /* The app-shell worker. It precaches the build so the rooms open with no
       signal; the push worker (/sw.js) is a separate registration and stays
       untouched. Registration lives in src/lib/appSw.ts — never in dev or
       preview — so injectRegister stays null and dev emits nothing. */
    VitePWA({
      strategies: "generateSW",
      filename: "app-sw.js",
      registerType: "autoUpdate",
      injectRegister: null,
      devOptions: { enabled: false },
      /* Installability already ships as public/manifest.webmanifest. */
      manifest: false,
      workbox: {
        /* Navigations hit the network first; the precached shell only answers
           when there is no signal at all. OAuth and the workers themselves
           never fall back to the shell. */
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/~oauth/, /^\/sw\.js$/, /^\/app-sw\.js$/],
        globPatterns: ["**/*.{js,css,html,svg,png,woff,woff2}"],
        /* The shell is one big bundle; it must precache whole or offline
           startup is a blank page. */
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        runtimeCaching: [
          {
            /* Same-origin hashed build assets are immutable — cache first. */
            urlPattern: ({ url, request }) =>
              request.destination !== "document" &&
              url.origin === (globalThis as { location?: { origin: string } }).location?.origin &&
              /\/assets\/.+\.(js|css)$/.test(url.pathname),
            handler: "CacheFirst",
            options: {
              cacheName: "metro-echo-assets",
              expiration: { maxEntries: 64, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));

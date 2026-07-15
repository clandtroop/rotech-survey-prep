import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // "prompt" instead of "autoUpdate" — the previous silent-reload-on-update
      // behavior was wiping specialists' in-progress OP 541/541T answers when
      // an update landed mid-visit. The app now shows an UpdateBanner (see
      // App.jsx) and reloads only when the specialist explicitly taps it.
      registerType: "prompt",
      injectRegister: false,
      base: "/rotech-survey-prep/",
      scope: "/rotech-survey-prep/",
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,jpg,svg,woff2}"],
        navigateFallback: "/rotech-survey-prep/index.html",
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/clandtroop\.github\.io\/rotech-survey-prep\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "rotech-survey-prep-cache",
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
      manifest: {
        name: "Rotech Survey Prep",
        short_name: "Survey Prep",
        description: "Rotech Healthcare Accreditation Survey Prep Checklist",
        theme_color: "#1a3a5c",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "portrait-primary",
        scope: "/rotech-survey-prep/",
        start_url: "/rotech-survey-prep/",
        icons: [
          {
            src: "/rotech-survey-prep/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any maskable",
          },
          {
            src: "/rotech-survey-prep/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
          {
            src: "/rotech-survey-prep/apple-touch-icon.png",
            sizes: "180x180",
            type: "image/png",
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  base: "/rotech-survey-prep/",
  build: { outDir: "dist" },
});

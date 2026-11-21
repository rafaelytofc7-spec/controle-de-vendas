import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "/controle-de-vendas/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "icon-192.png", "icon-512.png"],
      manifest: {
        name: "Controle de Vendas",
        short_name: "Vendas",
        description: "Caixa, cardápio e livro de vendas, funciona offline.",
        theme_color: "#1F7A4D",
        background_color: "#F7F4EC",
        display: "standalone",
        orientation: "portrait",
        lang: "pt-BR",
        start_url: "/controle-de-vendas/",
        scope: "/controle-de-vendas/",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2,json}"],
        navigateFallback: "/controle-de-vendas/index.html",
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/(firestore|firebase|identitytoolkit|securetoken)\.googleapis\.com\//,
            handler: "NetworkOnly",
          },
          {
            urlPattern: /^https:\/\/www\.googleapis\.com\//,
            handler: "NetworkOnly",
          },
          {
            urlPattern: /^https:\/\/accounts\.google\.com\//,
            handler: "NetworkOnly",
          },
        ],
      },
    }),
  ],
  server: { port: 5173, host: "127.0.0.1" },
  preview: { port: 4173, host: "127.0.0.1" },
});

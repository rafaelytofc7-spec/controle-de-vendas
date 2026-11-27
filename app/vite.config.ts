import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const capacitor = process.env.CAPACITOR === "1";
const base = capacitor ? "./" : (process.env.BASE_URL_PWA || "/controle-de-vendas/v3/");

export default defineConfig({
  base,
  plugins: [
    react(),
    ...(!capacitor ? [VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "icon-192.png", "icon-512.png"],
      manifest: {
        id: base, name: "Controle de Vendas", short_name: "Vendas", description: "Caixa, produtos e estoque — funciona offline.",
        theme_color: "#1E7A4D", background_color: "#F7F4EC", display: "standalone", lang: "pt-BR", start_url: base, scope: base,
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallback: `${base}index.html`,
        runtimeCaching: [{ urlPattern: /supabase\.co/, handler: "NetworkOnly" }],
      },
    })] : []),
  ],
  server: { port: 5174, host: "127.0.0.1" },
  preview: { port: 4174, host: "127.0.0.1" },
});

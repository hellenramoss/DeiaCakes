import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "/DeiaCakes/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["pwa-192.svg", "pwa-512.svg", "deia-logo.webp"],
      manifest: {
        name: "Déia Cake Ateliê",
        short_name: "Déia Cake",
        description: "Controle de pedidos, clientes, pagamentos e produção",
        theme_color: "#9a5d47",
        background_color: "#fff9f1",
        display: "standalone",
        id: "/DeiaCakes/",
        start_url: "/DeiaCakes/",
        icons: [
          {
            src: "pwa-192.svg",
            sizes: "192x192",
            type: "image/svg+xml",
            purpose: "any"
          },
          {
            src: "pwa-512.svg",
            sizes: "512x512",
            type: "image/svg+xml",
            purpose: "any"
          },
          {
            src: "pwa-512.svg",
            sizes: "512x512",
            type: "image/svg+xml",
            purpose: "maskable"
          }
        ]
      }
    })
  ]
});

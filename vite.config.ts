import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "/DeiaCakes/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [],
      manifest: {
        name: "Déia Cake Ateliê",
        short_name: "Déia Cake",
        description: "Controle de pedidos, clientes, pagamentos e produção",
        theme_color: "#9a5d47",
        background_color: "#fff9f1",
        display: "standalone",
        start_url: "/DeiaCakes/",
        icons: [
          {
            src: "deia-logo.webp",
            sizes: "256x256",
            type: "image/webp",
            purpose: "any"
          }
        ]
      }
    })
  ]
});

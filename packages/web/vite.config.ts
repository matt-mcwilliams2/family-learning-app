import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  server: {
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "icon-180x180.png"],
      manifest: {
        name: "Family Spelling",
        short_name: "Spelling",
        description: "A spelling practice app for kids",
        theme_color: "#002d53",
        background_color: "#002d53",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/icon-48x48.png", sizes: "48x48", type: "image/png" },
          { src: "/icon-72x72.png", sizes: "72x72", type: "image/png" },
          { src: "/icon-96x96.png", sizes: "96x96", type: "image/png" },
          { src: "/icon-128x128.png", sizes: "128x128", type: "image/png" },
          { src: "/icon-144x144.png", sizes: "144x144", type: "image/png" },
          { src: "/icon-152x152.png", sizes: "152x152", type: "image/png" },
          { src: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-384x384.png", sizes: "384x384", type: "image/png" },
          { src: "/icon-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ],
});

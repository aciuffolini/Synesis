import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "/Synesis/",            // 👈 importante para GitHub Pages
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Synesis Risk",
        short_name: "Synesis",
        start_url: "/Synesis/", // 👈 igual que base
        scope: "/Synesis/",     // 👈 igual que base
        display: "standalone",
        background_color: "#000000",
        theme_color: "#000000",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png" }
        ]
      },
      workbox: { globPatterns: ["**/*.{js,css,html,ico,png,svg}"] }
    })
  ]
});

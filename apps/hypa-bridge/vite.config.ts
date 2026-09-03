import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import tailwindcss from "@tailwindcss/vite";

// The browser app is served from a different origin/port than the BFF
// (apps/hypa-bridge-server) and never holds the API key.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5181,
    // Proxy the Bridge BFF so the browser only ever talks to this origin.
    proxy: {
      "/api": {
        target: process.env.BRIDGE_SERVER_URL || "http://localhost:5182",
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 5181,
    proxy: {
      "/api": {
        target: process.env.BRIDGE_SERVER_URL || "http://localhost:5182",
        changeOrigin: true,
      },
    },
  },
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});

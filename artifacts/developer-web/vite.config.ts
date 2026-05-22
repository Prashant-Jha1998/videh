import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const basePath = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base: basePath,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port: Number(process.env.DEVELOPER_WEB_PORT ?? 5175),
    host: "0.0.0.0",
    proxy: {
      "/api": { target: process.env.VITE_API_PROXY ?? "http://127.0.0.1:3000", changeOrigin: true },
      "/uploads": { target: process.env.VITE_API_PROXY ?? "http://127.0.0.1:3000", changeOrigin: true },
    },
  },
});

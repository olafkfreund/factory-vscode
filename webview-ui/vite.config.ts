import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base so built assets resolve under a VS Code webview URI.
// Single bundle (no hashed chunks) keeps host-side asset rewriting simple.
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name].[ext]",
      },
    },
  },
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [
    react(),
    {
      name: "manifest-copy",
      closeBundle() {
        fs.copyFileSync(
          path.resolve(__dirname, "public/manifest.json"),
          path.resolve(__dirname, "dist/manifest.json")
        );
      },
    },
    {
      name: "inject-script-reference",
      transformIndexHtml(html) {
        return html.replace(
          /<script type="module" src="\/src\/main.jsx"><\/script>/,
          `<script type="module" src="/assets/main.js"></script>`
        );
      },
    },
  ],
  build: {
    rollupOptions: {
      input: {
        sidebar: resolve(__dirname, "src/sidebar.html"),
        background: resolve(__dirname, "src/background.js"),
        content: resolve(__dirname, "src/content.js"),
      },
      output: {
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name].[ext]",
      },
    },
    outDir: "dist",
    emptyOutDir: true,
  },
  publicDir: "public",
});

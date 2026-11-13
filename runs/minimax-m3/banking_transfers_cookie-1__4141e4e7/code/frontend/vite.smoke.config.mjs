import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: "src/main.tsx",
      formats: ["iife"],
      name: "BankApp",
      fileName: () => "app.js",
    },
    outDir: "../.scratch/dist",
    emptyOutDir: true,
    minify: false,
  },
});

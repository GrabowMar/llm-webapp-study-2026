import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Builds a single IIFE bundle that can be executed inside jsdom for smoke tests.
export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: "src/main.tsx",
      formats: ["iife"],
      name: "KanbanApp",
      fileName: () => "kanban-test-bundle.js",
    },
    outDir: "dist-test",
    minify: false,
    emptyOutDir: true,
  },
});

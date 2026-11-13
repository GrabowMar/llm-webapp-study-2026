import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "/workspace/frontend",
  plugins: [react()],
  logLevel: "warn",
  build: {
    ssr: true,
    outDir: "/workspace/.uitest/dist",
    emptyOutDir: true,
    minify: false,
    rollupOptions: {
      input: "/workspace/frontend/src/main.tsx",
      output: { format: "cjs", entryFileNames: "app.cjs" },
    },
  },
});

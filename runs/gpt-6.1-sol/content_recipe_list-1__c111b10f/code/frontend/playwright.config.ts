import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";

export default defineConfig({
  testDir: "./tests",
  outputDir: "./test-results",
  workers: 1,
  timeout: 60000,
  expect: { timeout: 10000 },
  use: {
    baseURL: "http://127.0.0.1:8000",
    viewport: { width: 1440, height: 1000 },
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || undefined,
      args: process.env.CHROMIUM_ARGS ? JSON.parse(process.env.CHROMIUM_ARGS) : undefined,
    },
  },
  webServer: {
    command: "python3 -m gunicorn --bind 127.0.0.1:8000 --pythonpath ../backend app:app",
    url: "http://127.0.0.1:8000/api/health",
    env: { RECIPE_DATABASE: resolve(`../data/browser-tests-${Date.now()}.sqlite3`) },
    reuseExistingServer: false,
    timeout: 30000,
  },
});

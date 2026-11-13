import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:8001",
    viewport: { width: 1440, height: 1000 },
    launchOptions: process.env.CHROMIUM_EXECUTABLE_PATH ? {
      executablePath: process.env.CHROMIUM_EXECUTABLE_PATH,
      args: ["--no-sandbox", "--no-zygote"],
    } : {},
  },
  webServer: {
    command: "python3 -m gunicorn --bind 127.0.0.1:8001 --pythonpath backend app:app",
    cwd: "..",
    url: "http://127.0.0.1:8001/api/health",
    env: { DATABASE_PATH: ".cache/browser-tests.sqlite3" },
    reuseExistingServer: false,
  },
});

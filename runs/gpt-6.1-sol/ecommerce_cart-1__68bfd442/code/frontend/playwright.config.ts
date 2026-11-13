import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:8001",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    } : {},
  },
  webServer: {
    command: "../.venv/bin/python ../backend/test_server.py",
    url: "http://127.0.0.1:8001/api/health",
    env: { ADMIN_PASSWORD: "browser-test-admin-secret" },
    reuseExistingServer: false,
    timeout: 30000,
  },
});

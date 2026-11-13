import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  use: {
    baseURL: "http://127.0.0.1:8001",
    trace: "retain-on-failure",
    launchOptions: process.env.CHROMIUM_PATH ? {
      executablePath: process.env.CHROMIUM_PATH,
      args: ["--no-sandbox", "--no-zygote", "--disable-dev-shm-usage", "--disable-gpu"],
    } : {},
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" } },
  ],
  webServer: {
    command: "npm run build && python3 ../backend/app.py",
    env: { PORT: "8001", DATA_DIR: "../data/e2e" },
    url: "http://127.0.0.1:8001/api/health",
    timeout: 60000,
  },
});

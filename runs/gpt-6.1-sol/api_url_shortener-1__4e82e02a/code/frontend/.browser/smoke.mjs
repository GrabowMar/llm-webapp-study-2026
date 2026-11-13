import { chromium as playwright } from "../node_modules/playwright/index.mjs";
import chromium from "./node_modules/@sparticuz/chromium/build/index.js";
import { spawn } from "node:child_process";

const server = spawn("python3", ["tests/server.py"], { stdio: "inherit" });
let browser;
try {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      if ((await fetch("http://127.0.0.1:8001/api/health")).ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  browser = await playwright.launch({ executablePath: "/workspace/frontend/.browser/chromium", args: chromium.args });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on("console", (message) => console.log("browser:", message.text()));
  page.on("pageerror", (error) => console.log("page error:", error));
  page.on("crash", () => console.log("PAGE CRASHED"));
  try { await page.goto("http://127.0.0.1:8001"); } catch (error) { console.log(error.stack); }
  await page.waitForTimeout(2000);
  console.log("title:", await page.title());
  console.log("headings:", await page.locator("h1").allTextContents());
  await page.screenshot({ path: "/workspace/frontend/.browser/overview.png", fullPage: true });
} finally {
  await browser?.close();
  server.kill();
}

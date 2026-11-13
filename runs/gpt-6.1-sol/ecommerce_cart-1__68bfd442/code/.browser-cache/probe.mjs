import { chromium } from "../frontend/node_modules/playwright/index.mjs";

const browser = await chromium.launch({ executablePath: "/workspace/.browser-cache/chromium", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on("crash", () => console.log("PAGE CRASHED"));
page.on("pageerror", (error) => console.log("PAGE ERROR", error.message));
page.on("console", (message) => console.log("CONSOLE", message.text()));
try {
  await page.goto("http://127.0.0.1:8001", { waitUntil: "domcontentloaded", timeout: 10000 });
  console.log("NAVIGATED");
} catch (error) {
  console.log("NAVIGATION ERROR", error.message);
}
try {
  await page.waitForSelector("#collection article", { timeout: 10000 });
  console.log(await page.evaluate(() => ({
    height: document.documentElement.scrollHeight,
    width: document.documentElement.scrollWidth,
    hero: document.querySelector("main section")?.getBoundingClientRect().toJSON(),
    title: document.querySelector("h1")?.getBoundingClientRect().toJSON(),
  })));
} catch (error) {
  console.log("DOM ERROR", error.message);
}
await browser.close();

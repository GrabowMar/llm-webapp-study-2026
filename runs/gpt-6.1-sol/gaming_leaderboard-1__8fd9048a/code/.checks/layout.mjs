import { chromium as playwright } from "@playwright/test";
import chromium, { inflate, setupLambdaEnvironment } from "@sparticuz/chromium";
import { spawn } from "node:child_process";

const server = spawn("/workspace/.venv/bin/python", ["/workspace/.checks/server.py"], {
  cwd: "/workspace",
  env: { ...process.env, PYTHONPATH: "/workspace", ADMIN_PASSWORD: "", PORT: "8001" },
  stdio: "ignore",
});
for (let attempt = 0; attempt < 100; attempt++) {
  try { if ((await fetch("http://127.0.0.1:8001/api/health")).ok) break; } catch {}
  await new Promise(resolve => setTimeout(resolve, 100));
}
const body = JSON.stringify({ username: "APlayerNameThatIsThirtyTwoLetters".slice(0, 32), password: "browser-player-password" });
const registration = await fetch("http://127.0.0.1:8001/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body });
console.log("Registration", registration.status, await registration.json());
const session = await fetch("http://127.0.0.1:8001/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body });
const { token, error } = await session.json();
console.log("Login", session.status, error || "OK");
const other = JSON.stringify({ username: "ArcadeAce", password: "browser-player-password" });
await fetch("http://127.0.0.1:8001/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: other });
const login = await (await fetch("http://127.0.0.1:8001/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: other })).json();
await fetch("http://127.0.0.1:8001/api/scores", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${login.token}` }, body: JSON.stringify({ score: 8400 }) });
await inflate("/workspace/.checks/node_modules/@sparticuz/chromium/bin/al2023.tar.br");
setupLambdaEnvironment("/tmp/al2023/lib");
const browser = await playwright.launch({ executablePath: await chromium.executablePath(), args: chromium.args.filter(arg => arg !== "--single-process"), headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 320, height: 720 } });
  page.on("pageerror", error => console.log("Page error", error.message));
  page.on("console", event => console.log("Console", event.type(), event.text()));
  page.on("requestfinished", request => console.log("Finished", new URL(request.url()).pathname));
  page.on("requestfailed", request => console.log("Failed", new URL(request.url()).pathname, request.failure()));
  page.on("response", async response => { if (response.url().endsWith("/api/auth/me")) console.log("Session", response.status(), await response.json()); });
  await page.addInitScript(token => localStorage.setItem("highscore-token", token), token);
  await page.goto("http://127.0.0.1:8001");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Sign out" }).waitFor({ timeout: 10000 }).catch(async error => { console.log("Document", await page.locator("body").innerText()); throw error; });
  console.log(await page.evaluate(() => ({
    width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
    overflow: [...document.querySelectorAll("body *")].filter(el => el.getBoundingClientRect().right > innerWidth + 1).map(el => ({ tag: el.tagName, text: el.textContent?.slice(0, 90), class: el.className, right: el.getBoundingClientRect().right })).slice(0, 25),
  })));
} finally { await browser.close(); server.kill("SIGINT"); }

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium as playwright } from "playwright-core";
import chromium, { inflate, setupLambdaEnvironment } from "@sparticuz/chromium";

const server = spawn("python3", ["-m", "gunicorn", "--bind", "127.0.0.1:8000", "--pythonpath", "backend", "--workers", "2", "app:app"], {
  cwd: "/workspace",
  env: { ...process.env, DATABASE_PATH: `/workspace/.browser-check/smoke-${Date.now()}.sqlite3` },
  stdio: ["ignore", "ignore", "pipe"],
});
let serverLog = "";
server.stderr.on("data", data => { serverLog += data; });
let browser;
const waitFor = async (condition, message) => {
  for (let i = 0; i < 100; i++) {
    if (await condition()) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(message);
};
try {
  await waitFor(async () => {
    try { return (await fetch("http://127.0.0.1:8000/api/health")).ok; } catch { return false; }
  }, `Server failed to start: ${serverLog}`);
  await inflate("/workspace/.browser-check/node_modules/@sparticuz/chromium/bin/al2023.tar.br");
  setupLambdaEnvironment("/tmp/al2023/lib");
  browser = await playwright.launch({ executablePath: await chromium.executablePath(), args: ["--no-sandbox", "--no-zygote", "--disable-gpu", "--disable-dev-shm-usage"], headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto("http://127.0.0.1:8000");
  await page.getByRole("heading", { name: "Your calendar." }).waitFor();
  await page.getByText("Gathering your plans...").waitFor({ state: "hidden" });
  await page.screenshot({ path: "/workspace/.browser-check/desktop.png", fullPage: true });
  const initialTitle = await page.getByRole("region", { name: "Event calendar" }).getByRole("heading").first().textContent();
  await page.getByRole("button", { name: "Next month", exact: true }).click();
  assert.notEqual(await page.getByRole("region", { name: "Event calendar" }).getByRole("heading").first().textContent(), initialTitle);
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await page.getByRole("button", { name: "week", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "week", exact: true }).getAttribute("aria-pressed"), "true");
  await page.getByRole("button", { name: "day", exact: true }).click();
  await page.getByRole("button", { name: "month", exact: true }).click();
  await page.getByRole("button", { name: "New event", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  const username = `browser-${Date.now()}`;
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill("a-private-passphrase");
  await page.getByRole("button", { name: "Create your account" }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByText(username, { exact: true }).waitFor();
  await page.getByRole("button", { name: "New event", exact: true }).click();
  await page.getByLabel("Event title *", { exact: true }).fill("Smoke picnic");
  const date = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  await page.getByLabel("Starts *", { exact: true }).fill(`${date}T09:00`);
  await page.getByLabel("Ends *", { exact: true }).fill(`${date}T09:00`);
  await page.getByRole("button", { name: "Create event", exact: true }).click();
  await page.getByText("End time must be after start time.", { exact: true }).waitFor();
  await page.getByLabel("Ends *", { exact: true }).fill(`${date}T10:30`);
  await page.getByLabel("Location", { exact: true }).fill("Community garden");
  await page.getByLabel("Description", { exact: true }).fill("Bring something to share.");
  await page.getByRole("button", { name: "Create event", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByRole("button", { name: /Smoke picnic/ }).first().click();
  await page.getByRole("dialog").getByRole("heading", { name: "Smoke picnic", exact: true }).waitFor();
  await page.getByRole("button", { name: "Edit event", exact: true }).click();
  await page.getByLabel("Event title *", { exact: true }).fill("Smoke picnic updated");
  await page.getByLabel("Description", { exact: true }).fill("");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByRole("searchbox", { name: "Search events" }).fill("not-a-real-event");
  await page.getByText("No events found. Try another search.").waitFor();
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  assert.equal(await page.evaluate(() => !!localStorage.getItem("gather-token")), true);
  await page.reload();
  await page.getByText(username, { exact: true }).waitFor();
  await page.getByRole("button", { name: /Smoke picnic updated/ }).first().click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Keep event", exact: true }).click();
  await page.getByRole("dialog").getByRole("heading", { name: "Smoke picnic updated", exact: true }).waitFor();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Delete event", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByRole("button", { name: "Sign in", exact: true }).waitFor();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill("a-private-passphrase");
  await page.getByRole("dialog").locator("form").getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByText(username, { exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "/workspace/.browser-check/mobile.png", fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  await page.getByRole("button", { name: "Today’s agenda", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "day", exact: true }).getAttribute("aria-pressed"), "true");
  await page.getByRole("button", { name: "New event", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  assert.deepEqual(pageErrors, []);
  console.log("Browser smoke test passed: navigation, registration, validation, create/edit/delete, search, persistent sign-in, sign-out, and mobile layout.");
} finally {
  if (browser) await browser.close();
  server.kill("SIGTERM");
}

import { chromium as playwright, expect } from "@playwright/test";
import chromium, { inflate, setupLambdaEnvironment } from "@sparticuz/chromium";
import { spawn } from "node:child_process";

const server = spawn("/workspace/.venv/bin/python", ["/workspace/.checks/server.py"], {
  cwd: "/workspace",
  env: { ...process.env, PYTHONPATH: "/workspace", ADMIN_PASSWORD: "browser-admin-password", PORT: "8001" },
  stdio: "ignore",
});
for (let attempt = 0; attempt < 100; attempt++) {
  try { if ((await fetch("http://127.0.0.1:8001/api/health")).ok) break; } catch {}
  await new Promise(resolve => setTimeout(resolve, 100));
}

await inflate("/workspace/.checks/node_modules/@sparticuz/chromium/bin/al2023.tar.br");
setupLambdaEnvironment("/tmp/al2023/lib");
const browser = await playwright.launch({
  executablePath: await chromium.executablePath(),
  args: chromium.args.filter(arg => arg !== "--single-process"),
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = [];
page.on("pageerror", error => errors.push(error.message));
page.on("requestfailed", request => console.log("Request failed", new URL(request.url()).pathname, request.failure()));
const base = "http://127.0.0.1:8001";
try {
  await page.goto(base);
  await expect(page.getByText("Be the first on the board.")).toBeVisible();
  await page.screenshot({ path: "/workspace/.checks/desktop-empty.png", fullPage: true });
  await page.getByRole("button", { name: "Join the game", exact: true }).click();
  await page.getByRole("textbox", { name: "Username" }).fill("ArcadeAce");
  await page.getByLabel("Password", { exact: true }).fill("browser-player-password");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await page.getByLabel("Your score", { exact: true }).fill("8400");
  await page.getByRole("button", { name: "Submit score", exact: true }).click();
  await expect(page.getByText("New personal best!", { exact: true })).toBeVisible();
  await expect(page.getByText("Your all-time rank:")).toContainText("#1");
  await expect(page.getByRole("table", { name: "Player leaderboard" }).getByText("ArcadeAce")).toBeVisible();
  await page.getByLabel("Your score", { exact: true }).fill("5000");
  await page.getByRole("button", { name: "Submit score", exact: true }).click();
  await expect(page.getByText("5,000 points submitted")).toBeVisible();
  await expect(page.getByText("New personal best!", { exact: true })).toHaveCount(0);
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Player leaderboard" }).getByText("8,400")).toBeVisible();
  await page.getByRole("tab", { name: "This week", exact: true }).click();
  await expect(page.getByRole("tab", { name: "This week" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Today", exact: true }).click();
  await expect(page.getByRole("table", { name: "Player leaderboard" }).getByText("8,400")).toBeVisible();
  await page.getByRole("textbox", { name: "Search players" }).fill("not-a-player");
  await expect(page.getByText("No players found", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Clear search", exact: true }).first().click();
  await expect(page.getByRole("table", { name: "Player leaderboard" }).getByText("ArcadeAce")).toBeVisible();
  await page.screenshot({ path: "/workspace/.checks/desktop-player.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "/workspace/.checks/mobile-player.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("textbox", { name: "Username" }).fill("admin");
  await page.getByLabel("Password", { exact: true }).fill("browser-admin-password");
  await page.getByRole("dialog").getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("Score moderation", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Hide score 1 by ArcadeAce", exact: true }).click();
  await expect(page.getByRole("table", { name: "Player leaderboard" }).getByText("5,000")).toBeVisible();
  await expect(page.getByRole("button", { name: "Show score 1 by ArcadeAce", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Show score 1 by ArcadeAce", exact: true }).click();
  await expect(page.getByRole("table", { name: "Player leaderboard" }).getByText("8,400")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.screenshot({ path: "/workspace/.checks/desktop-admin.png", fullPage: true });
  await page.setViewportSize({ width: 320, height: 720 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByRole("button", { name: "Join the game", exact: true }).click();
  await page.getByRole("textbox", { name: "Username" }).fill("APlayerNameThatIsThirtyTwoLetters".slice(0, 32));
  await page.getByLabel("Password", { exact: true }).fill("browser-player-password");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  console.log("Browser checks passed: registration, login, submission, personal best, session restore, periods, search, logout, admin hide/show, and mobile overflow.");
} catch (error) {
  console.log("Page errors", errors);
  await page.screenshot({ path: "/workspace/.checks/failure.png", fullPage: true });
  throw error;
} finally {
  await browser.close();
  server.kill("SIGINT");
}

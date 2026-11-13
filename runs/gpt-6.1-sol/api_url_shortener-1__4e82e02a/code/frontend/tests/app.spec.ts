import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

async function register(page: Page, username: string) {
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Username", { exact: true }).fill(username);
  await dialog.getByLabel("Password", { exact: true }).fill("e2e-user-password");
  await dialog.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}

async function navigate(page: Page, label: string) {
  const menu = page.getByRole("button", { name: "Open navigation" });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("navigation").getByRole("button", { name: label, exact: true }).click();
}

test("register, validate, shorten, copy, count a click, and delete", async ({ page, request }, testInfo) => {
  const username = `user_${testInfo.project.name}_${Date.now()}`;
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Small links. Big possibilities." })).toBeVisible();
  await register(page, username);

  await page.getByLabel("URL to shorten").fill("javascript:alert(1)");
  await page.getByRole("button", { name: "Shorten link", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("http:// or https://");
  const original = `https://example.com/${username}`;
  await page.getByLabel("URL to shorten").fill(original);
  await page.getByRole("button", { name: "Shorten link", exact: true }).click();
  const result = page.locator("section", { has: page.getByRole("heading", { name: "Shorten a link", exact: true }) }).getByRole("link");
  await expect(result).toBeVisible();
  const shortPath = await result.getAttribute("href");
  expect(shortPath).toMatch(/^\/r\//);
  await page.getByRole("button", { name: "Copy link", exact: true }).click();
  await expect(page.getByRole("button", { name: "Copied!", exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(new URL(shortPath!, page.url()).href);

  const redirect = await request.get(shortPath!, { maxRedirects: 0 });
  expect(redirect.status()).toBe(302);
  expect(redirect.headers().location).toBe(original);
  await page.getByRole("button", { name: "Refresh links and click counts" }).click();
  const row = page.getByRole("row").filter({ has: page.getByRole("link", { name: original, exact: true }) });
  await expect(row).toBeVisible();
  await expect(row.getByRole("cell").nth(2)).toContainText("1");
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", testInfo.project.name === "mobile" ? 390 : 1440);
  await page.screenshot({ path: testInfo.outputPath("dashboard.png"), fullPage: true });

  await row.getByRole("button", { name: /^Delete link/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Keep link" }).click();
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: /^Delete link/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete permanently" }).click();
  await expect(row).not.toBeVisible();
  expect((await request.get(shortPath!, { maxRedirects: 0 })).status()).toBe(404);

  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByRole("button", { name: "Sign in", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Username", { exact: true }).fill(username);
  await dialog.getByLabel("Password", { exact: true }).fill("e2e-user-password");
  await dialog.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
});

test("my links are paged and searchable", async ({ page, request }, testInfo) => {
  const username = `paged_${testInfo.project.name}_${Date.now()}`;
  await page.goto("/");
  await register(page, username);
  const token = await page.evaluate(() => localStorage.getItem("trim_token"));
  for (let i = 0; i < 7; i++) {
    const response = await request.post("/api/links", { headers: { Authorization: `Bearer ${token}` }, data: { original_url: `https://example.com/${username}/item-${i}` } });
    expect(response.status()).toBe(201);
  }
  await navigate(page, "My links");
  await expect(page.getByRole("table").getByRole("row")).toHaveCount(6);
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page.getByRole("table").getByRole("row")).toHaveCount(3);
  await page.getByRole("searchbox", { name: "Search links" }).fill("item-4");
  await expect(page.getByRole("table").getByRole("row")).toHaveCount(2);
  await expect(page.getByRole("link", { name: `https://example.com/${username}/item-4`, exact: true })).toBeVisible();
});

test("admin can disable and re-enable a link", async ({ page, request }, testInfo) => {
  const username = `mod_${testInfo.project.name}_${Date.now()}`;
  await request.post("/api/auth/register", { data: { username, password: "e2e-user-password" } });
  const login = await request.post("/api/auth/login", { data: { username, password: "e2e-user-password" } });
  const { token } = await login.json();
  const created = await request.post("/api/links", { headers: { Authorization: `Bearer ${token}` }, data: { original_url: `https://example.com/${username}` } });
  const link = await created.json();

  await page.goto("/");
  await page.getByRole("button", { name: "Sign in", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Username", { exact: true }).fill("admin");
  await dialog.getByLabel("Password", { exact: true }).fill("e2e-test-admin-password");
  await dialog.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await navigate(page, "Moderation");
  await page.getByRole("searchbox", { name: "Search links" }).fill(link.short_code);
  const row = page.getByRole("row").filter({ has: page.getByRole("link", { name: link.original_url, exact: true }) });
  await expect(row).toContainText(username);
  await row.getByRole("button", { name: `Disable link ${link.short_code}`, exact: true }).click();
  await expect(row).toContainText("Disabled");
  expect((await request.get(link.short_url, { maxRedirects: 0 })).status()).toBe(404);
  await row.getByRole("button", { name: `Re-enable link ${link.short_code}`, exact: true }).click();
  await expect(row).toContainText("Active");
  expect((await request.get(link.short_url, { maxRedirects: 0 })).status()).toBe(302);
});

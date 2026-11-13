import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
});

test("browsing, search, category filtering, pagination and product detail", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /Good things\.\s*For everyday living\./ })).toBeVisible();
  await expect(page.locator("#collection article")).toHaveCount(8);
  await page.screenshot({ path: "test-results/storefront-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(page.locator("#collection article")).toHaveCount(4);
  await expect(page.getByText("Showing 9–12 of 12")).toBeVisible();
  await page.getByRole("button", { name: "Home & living", exact: true }).click();
  await expect(page.locator("#collection article")).toHaveCount(6);
  await page.getByRole("searchbox").fill("ceramic");
  await expect(page.locator("#collection article")).toHaveCount(1);
  await page.getByRole("button", { name: "View Everyday ceramic mug", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog").getByText("$18.00")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("searchbox").fill("no-such-object");
  await expect(page.getByRole("heading", { name: "Nothing here just yet." })).toBeVisible();
  await page.getByRole("button", { name: "See all objects" }).click();
  await expect(page.locator("#collection article")).toHaveCount(8);
  expect(errors).toEqual([]);
});

test("registration, sign-in, saved cart, stepper and server rejection messages", async ({ page, request }) => {
  const username = `shopper-${Date.now()}`;
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Add Amber glass vase to cart", exact: true }).click();
  await page.getByRole("button", { name: "Create an account", exact: true }).click();
  await page.getByRole("textbox", { name: "Username" }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill("shop-test-password");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open cart, 1 item", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Open cart, 1 item", exact: true }).click();
  await expect(page.getByRole("dialog").getByText("$32.00", { exact: true })).toHaveCount(2);
  await page.getByRole("button", { name: "Increase quantity of Amber glass vase" }).click();
  await expect(page.getByRole("dialog").getByText("$64.00", { exact: true })).toHaveCount(2);
  await page.getByRole("button", { name: "Decrease quantity of Amber glass vase" }).click();
  await expect(page.getByRole("dialog").getByText("$32.00", { exact: true })).toHaveCount(2);
  const adminLogin = await request.post("/api/auth/login", { data: { username: "admin", password: "browser-test-admin-secret" } });
  const { token } = await adminLogin.json() as { token: string };
  const headers = { Authorization: `Bearer ${token}` };
  const result = await request.get("/api/products?q=amber");
  const { items: [product] } = await result.json() as { items: { id: number; stock: number; price: number }[] };
  try {
    await request.patch(`/api/admin/products/${product.id}`, { headers, data: { price: 19.99, stock: 1 } });
    await page.getByRole("button", { name: "Increase quantity of Amber glass vase" }).click();
    await expect(page.getByRole("alert")).toContainText("Only 1 available");
    await page.getByRole("button", { name: "Close dialog" }).click();
    await page.getByRole("button", { name: "Open cart, 1 item", exact: true }).click();
    await expect(page.getByRole("dialog").getByText("$19.99", { exact: true })).toHaveCount(2);
    await page.getByRole("button", { name: "Close dialog" }).click();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByRole("textbox", { name: "Username" }).fill(username);
    await page.getByLabel("Password", { exact: true }).fill("shop-test-password");
    await page.getByRole("dialog").getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("button", { name: "Open cart, 1 item", exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: "Open cart, 1 item", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Open cart, 1 item", exact: true }).click();
    await page.getByRole("button", { name: "Remove Amber glass vase", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Good things are waiting." })).toBeVisible();
  } finally {
    await request.patch(`/api/admin/products/${product.id}`, { headers, data: { price: product.price, stock: product.stock } });
  }
});

test("admin adds a product, updates stock and price, hides and restores it", async ({ page, request }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("textbox", { name: "Username" }).fill("admin");
  await page.getByLabel("Password", { exact: true }).fill("browser-test-admin-secret");
  await page.getByRole("dialog").getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: "Manage products", exact: true }).click();
  const name = `A browser test object ${Date.now()}`;
  await page.getByRole("textbox", { name: "Product name" }).fill(name);
  await page.getByRole("spinbutton", { name: "Price ($)", exact: true }).fill("25.50");
  await page.getByRole("spinbutton", { name: "Stock", exact: true }).fill("15");
  await page.getByRole("textbox", { name: "Description" }).fill("A thoughtfully made object.");
  await page.getByRole("button", { name: "Add product", exact: true }).click();
  await expect(page.locator("main").getByRole("status")).toContainText("added at $25.50");
  const row = page.getByRole("row").filter({ hasText: name });
  await expect(row).toBeVisible();
  await row.getByRole("spinbutton", { name: `Price for ${name}`, exact: true }).fill("30.00");
  await row.getByRole("spinbutton", { name: `Stock for ${name}`, exact: true }).fill("0");
  await row.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator("main").getByRole("status")).toContainText("Product saved");
  await page.getByRole("button", { name: "Back to the collection" }).click();
  await page.getByRole("searchbox").fill(name);
  await expect(page.locator("#collection article")).toHaveCount(1);
  await expect(page.getByText("Out of stock", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: `Add ${name} to cart`, exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Manage products", exact: true }).click();
  await row.getByRole("checkbox", { name: `Active status for ${name}`, exact: true }).uncheck();
  await row.getByRole("button", { name: "Save", exact: true }).click();
  await expect(row.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  const hidden = await request.get(`/api/products?q=${encodeURIComponent(name)}`);
  expect((await hidden.json() as { total: number }).total).toBe(0);
  await row.getByRole("checkbox", { name: `Active status for ${name}`, exact: true }).check();
  await row.getByRole("button", { name: "Save", exact: true }).click();
  await expect(row.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  const visible = await request.get(`/api/products?q=${encodeURIComponent(name)}`);
  expect((await visible.json() as { total: number }).total).toBe(1);
});

test("mobile layout fits and account dialog can be dismissed with the keyboard", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#collection article")).toHaveCount(8);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/storefront-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const bounds = await page.getByRole("dialog").boundingBox();
  expect(bounds?.width).toBeLessThan(390);
  await expect(page.getByRole("textbox", { name: "Username" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeFocused();
});

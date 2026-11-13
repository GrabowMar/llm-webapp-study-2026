import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

async function register(page: Page) {
  const username = `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill("a-secure-password");
  await page.getByRole("button", { name: "Create your account", exact: true }).click();
  await expect(page.getByRole("heading", { name: "My tasks." })).toBeVisible();
  await expect(page.getByRole("tabpanel")).toHaveAttribute("aria-busy", "false");
  return username;
}

test("register, create, validate, edit, complete, filter, delete, and sign in", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const username = await register(page);
  await page.getByRole("button", { name: "New task", exact: true }).click();
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  await expect(page.getByText("Give your task a title between 1 and 200 characters.")).toBeVisible();
  await page.getByLabel("Task title").fill("Plan a calmer week");
  await page.getByLabel("Description (optional)").fill("Leave some breathing room.");
  await page.getByLabel("Priority", { exact: true }).selectOption("high");
  await page.getByLabel("Due date (optional)").fill("2020-01-01");
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  await expect(page.getByText("Plan a calmer week", { exact: true })).toBeVisible();
  await expect(page.getByText("Overdue", { exact: false }).and(page.locator(":visible")).first()).toBeVisible();
  await expect(page.getByText("1 still to do", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Edit Plan a calmer week", exact: true }).click();
  await page.getByLabel("Task title").fill("Make time for a walk");
  await page.getByLabel("Priority", { exact: true }).selectOption("low");
  await page.getByLabel("Due date (optional)").fill("");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("Make time for a walk", { exact: true })).toBeVisible();
  await expect(page.getByText("Leave some breathing room.", { exact: true })).toBeVisible();
  await page.getByLabel("Filter by priority").selectOption("high");
  await expect(page.getByText("No tasks match this filter.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Clear priority filter", exact: true }).click();
  await page.getByRole("checkbox", { name: "Complete Make time for a walk", exact: true }).check();
  await expect(page.getByRole("checkbox", { name: "Reopen Make time for a walk", exact: true })).toBeChecked();
  await page.getByRole("tab", { name: /^Open/ }).click();
  await expect(page.getByText("All caught up. Look at you!", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: /^Completed/ }).click();
  await expect(page.getByText("Make time for a walk", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Delete Make time for a walk", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Keep task", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Delete Make time for a walk", exact: true }).click();
  await page.getByRole("button", { name: "Delete task", exact: true }).click();
  await expect(page.getByText("Your little wins will live here.", { exact: true })).toBeVisible();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "My tasks." })).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Welcome back." })).toBeVisible();
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "Sign in to your space", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("The username or password is incorrect.");
  await page.getByLabel("Password", { exact: true }).fill("a-secure-password");
  await page.getByRole("button", { name: "Sign in to your space", exact: true }).click();
  await expect(page.getByRole("heading", { name: "My tasks." })).toBeVisible();
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("load more and persistent tasks", async ({ page }) => {
  await register(page);
  const token = await page.evaluate(() => localStorage.getItem("tidy-token"));
  for (let index = 0; index < 12; index++) {
    const response = await page.request.post("/api/todos", {
      headers: { Authorization: `Bearer ${token}` },
      data: { title: `Little task ${index + 1}`, priority: "medium" },
    });
    expect(response.status()).toBe(201);
  }
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText("10 of 12 tasks", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Load more", exact: true }).click();
  await expect(page.getByText("12 of 12 tasks", { exact: false })).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(12);
  await expect(page.getByRole("button", { name: "Load more", exact: true })).toHaveCount(0);
});

test("completion updates immediately, rolls back on failure, and persists", async ({ page }) => {
  await register(page);
  const token = await page.evaluate(() => localStorage.getItem("tidy-token"));
  const response = await page.request.post("/api/todos", {
    headers: { Authorization: `Bearer ${token}` },
    data: { title: "A small step" },
  });
  expect(response.status()).toBe(201);
  const todo = await response.json();
  await page.reload({ waitUntil: "domcontentloaded" });
  const checkbox = page.getByRole("checkbox");
  await expect(checkbox).toBeEnabled();

  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.route(`**/api/todos/${todo.id}`, async (route) => {
    await pending;
    await route.fulfill({ status: 503, json: { error: "Couldn't save your task. Please try again." } });
  });
  await checkbox.check();
  await expect(checkbox).toBeChecked();
  await expect(checkbox).toBeDisabled();
  release();
  await expect(page.getByRole("alert")).toContainText("Couldn't save your task.");
  await expect(checkbox).not.toBeChecked();
  await expect(checkbox).toBeEnabled();
  await page.unroute(`**/api/todos/${todo.id}`);

  const saved = page.waitForResponse((result) => result.url().endsWith(`/api/todos/${todo.id}`) && result.request().method() === "PATCH");
  await checkbox.check();
  const completed = await (await saved).json();
  expect(completed.completed).toBe(true);
  expect(completed.completed_at).toEqual(expect.any(String));
  await expect(checkbox).toBeEnabled();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(checkbox).toBeChecked();

  const reopened = page.waitForResponse((result) => result.url().endsWith(`/api/todos/${todo.id}`) && result.request().method() === "PATCH");
  await checkbox.uncheck();
  const open = await (await reopened).json();
  expect(open.completed).toBe(false);
  expect(open.completed_at).toBeNull();
  await expect(checkbox).toBeEnabled();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(checkbox).not.toBeChecked();
});

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const here = path.dirname(fileURLToPath(import.meta.url));
const bundlePath = path.join(here, "..", "dist-test", "kanban-test-bundle.js");
const origin = process.env.APP_ORIGIN ?? "http://127.0.0.1:8000";

if (!fs.existsSync(bundlePath)) {
  console.error(`missing ${bundlePath}; run "npm run build:test" first`);
  process.exit(1);
}

const bundle = fs.readFileSync(bundlePath, "utf8");

let failures = 0;
function check(label, condition, extra = "") {
  if (condition) {
    console.log(`[ok ] ${label}`);
  } else {
    failures += 1;
    console.log(`[FAIL] ${label} ${extra}`);
  }
}

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', {
  url: `${origin}/`,
  pretendToBeVisual: true,
  runScripts: "outside-only",
});

const { window } = dom;
window.fetch = async (input, init = {}) => {
  const url = typeof input === "string" ? new URL(input, origin).toString() : input;
  return fetch(url, init);
};
window.scrollTo = () => {};
window.process = { env: { NODE_ENV: "development" } };

window.eval(bundle);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const doc = window.document;

const text = () => doc.body.textContent ?? "";
const byText = (selector, needle) =>
  [...doc.querySelectorAll(selector)].find((node) => (node.textContent ?? "").includes(needle));

async function click(node) {
  node.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  await sleep(120);
}

async function submitForm(form, values) {
  for (const [name, value] of Object.entries(values)) {
    const field = form.querySelector(`[name="${name}"]`);
    if (!field) throw new Error(`field ${name} not found`);
    const prototype = field.tagName === "TEXTAREA" ? window.HTMLTextAreaElement : window.HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(prototype.prototype, "value").set;
    setter.call(field, value);
    field.dispatchEvent(new window.Event("input", { bubbles: true }));
    field.dispatchEvent(new window.Event("change", { bubbles: true }));
  }
  await sleep(60);
  form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await sleep(400);
}

await sleep(700);

// --- guest view -------------------------------------------------------------
check("renders To Do column", text().includes("To Do"));
check("renders In Progress column", text().includes("In Progress"));
check("renders Done column", text().includes("Done"));
check("shows priority filter", Boolean(doc.querySelector("#priority-filter")));
check("shows sign in form for guests", text().includes("Sign in to edit the board"));
check("hides new task button for guests", !byText("button", "New task"));

// --- register ---------------------------------------------------------------
const authForm = doc.querySelector("form");
const username = `tester${Date.now()}`;
await submitForm(authForm, { username, password: "secret123" });

check("registers and shows username", text().includes(username), text().slice(0, 200));
check("shows sign out button", Boolean(byText("button", "Sign out")));
check("hides auth panel after sign in", !text().includes("Sign in to edit the board"));
check("shows new task button", Boolean(byText("button", "New task")));

// --- create a task ----------------------------------------------------------
await click(byText("button", "New task"));
const dialog = doc.querySelector('[role="dialog"]');
check("opens task dialog", Boolean(dialog));
await submitForm(dialog.querySelector("form"), {
  title: "Write the report",
  description: "Summary of the quarter",
  priority: "high",
});
const cards = [...doc.querySelectorAll("[data-task-id]")];
check("creates a task card", cards.some((card) => card.textContent.includes("Write the report")), text().slice(0, 300));
check(
  "card shows priority badge",
  cards.some((card) => card.querySelector('[data-priority="high"]')),
);
check("task landed in To Do", Boolean(doc.querySelector('[data-column="todo"] [data-task-id]')));

// --- validation message -----------------------------------------------------
await click(byText("button", "New task"));
const emptyForm = doc.querySelector('[role="dialog"] form');
await submitForm(emptyForm, { title: "" });
check(
  "shows api validation message",
  (doc.querySelector('[role="dialog"]')?.textContent ?? "").includes("Title is required"),
  doc.querySelector('[role="dialog"]')?.textContent ?? "",
);
await click(byText('[role="dialog"] button[aria-label="Close dialog"]') ?? byText("button", "Cancel"));

// --- edit -------------------------------------------------------------------
const card = [...doc.querySelectorAll("[data-task-id]")].find((node) =>
  node.textContent.includes("Write the report"),
);
await click(card);
const editForm = doc.querySelector('[role="dialog"] form');
check("opens edit dialog", Boolean(editForm));
await submitForm(editForm, { title: "Write the final report" });
check(
  "updates the task",
  [...doc.querySelectorAll("[data-task-id]")].some((node) =>
    node.textContent.includes("Write the final report"),
  ),
  text().slice(0, 300),
);

// --- priority filter --------------------------------------------------------
await sleep(200);
const filter = doc.querySelector("#priority-filter");
const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set;
setter.call(filter, "low");
filter.dispatchEvent(new window.Event("change", { bubbles: true }));
await sleep(300);
check(
  "priority filter hides other cards",
  ![...doc.querySelectorAll("[data-task-id]")].some((node) =>
    node.textContent.includes("Write the final report"),
  ),
);
setter.call(filter, "all");
filter.dispatchEvent(new window.Event("change", { bubbles: true }));
await sleep(300);
check(
  "priority filter shows all cards again",
  [...doc.querySelectorAll("[data-task-id]")].some((node) =>
    node.textContent.includes("Write the final report"),
  ),
);

// --- delete with confirmation ----------------------------------------------
const cardAgain = [...doc.querySelectorAll("[data-task-id]")].find((node) =>
  node.textContent.includes("Write the final report"),
);
const deleteButton = [...cardAgain.querySelectorAll("button")].find(
  (node) => node.textContent.trim() === "Delete",
);
await click(deleteButton);
check("asks for confirmation", (doc.querySelector('[role="dialog"]')?.textContent ?? "").includes("Delete task"));
const confirmButton = [...doc.querySelectorAll('[role="dialog"] button')].find(
  (node) => node.textContent.trim() === "Delete",
);
await click(confirmButton);
await sleep(300);
check(
  "deletes the task",
  ![...doc.querySelectorAll("[data-task-id]")].some((node) =>
    node.textContent.includes("Write the final report"),
  ),
);

console.log(failures === 0 ? "all render checks ok" : `${failures} failures`);
process.exit(failures === 0 ? 0 : 1);

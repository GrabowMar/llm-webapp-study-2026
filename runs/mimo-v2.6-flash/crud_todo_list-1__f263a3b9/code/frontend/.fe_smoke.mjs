/* UI smoke test: renders the real Vite bundle in jsdom against localhost:8000. */
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { JSDOM, VirtualConsole } from "jsdom";

const BASE = "http://localhost:8000";
const here = path.dirname(fileURLToPath(import.meta.url));
const failures = [];

function check(label, condition, detail = "") {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    console.log(`  FAIL ${label} ${detail}`);
    failures.push(label);
  }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(label, fn, timeout = 5000) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeout) {
    last = fn();
    if (last) return last;
    await wait(40);
  }
  throw new Error(`timeout waiting for: ${label} (last=${JSON.stringify(last)})`);
}

async function api(method, pathName, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + pathName, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

function normalizedText() {
  return (dom.window.document.body.textContent || "").replace(/\s+/g, " ");
}

function liWithTitle(title) {
  return [...dom.window.document.querySelectorAll("li")].find((li) =>
    [...li.querySelectorAll("span")].some(
      (span) => span.textContent.trim() === title,
    ),
  );
}

function badgeTexts() {
  return [...dom.window.document.querySelectorAll("li span.rounded-full")].map(
    (span) => span.textContent.trim(),
  );
}

function buttonByText(label) {
  return [...dom.window.document.querySelectorAll("button")].find(
    (b) => b.textContent === label,
  );
}

function setInput(el, value) {
  const proto =
    el.tagName === "TEXTAREA"
      ? dom.window.HTMLTextAreaElement.prototype
      : dom.window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
  el.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
}

function setSelect(el, value) {
  Object.getOwnPropertyDescriptor(
    dom.window.HTMLSelectElement.prototype,
    "value",
  ).set.call(el, value);
  el.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
}

function click(el) {
  el.dispatchEvent(
    new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }),
  );
}

function submitForm(form) {
  form.dispatchEvent(
    new dom.window.Event("submit", { bubbles: true, cancelable: true }),
  );
}

// ---- seed data ------------------------------------------------------------
// Page 1 of "All" (page_size 10) is [Task 12, Task 11 ... Task 3]:
// open sorted by due-date-then-created-desc, completed last.
const stamp = Date.now();
const username = `smoke_${stamp}`;
const password = "hunter2";
const reg = await api("POST", "/api/auth/register", { username, password });
check("seed register", reg.status === 201, reg);
const login = await api("POST", "/api/auth/login", { username, password });
check("seed login", login.status === 200, login);
const token = login.body.token;

const priorities = ["high", "low", "medium"];
for (let i = 1; i <= 12; i += 1) {
  const body = { title: `Task ${i}`, priority: priorities[i % 3] };
  if (i === 1) body.completed = true;
  if (i === 12) {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    body.due_date = yesterday.toISOString().slice(0, 10);
  }
  const created = await api("POST", "/api/todos", body, token);
  if (created.status !== 201) check(`seed todo ${i}`, false, created);
}

// ---- jsdom setup ----------------------------------------------------------
const virtualConsole = new VirtualConsole();
virtualConsole.on("jsdomError", (err) => {
  if (!String(err.message).includes("Could not parse CSS")) {
    console.error("  jsdom error:", err.message);
  }
});
const dom = new JSDOM(
  '<!DOCTYPE html><html><body><div id="root"></div></body></html>',
  { url: BASE + "/", pretendToBeVisual: true, virtualConsole },
);

for (const key of [
  "window",
  "document",
  "localStorage",
  "sessionStorage",
  "navigator",
  "HTMLElement",
  "HTMLInputElement",
  "HTMLTextAreaElement",
  "HTMLSelectElement",
  "Element",
  "Node",
  "Event",
  "MouseEvent",
  "KeyboardEvent",
  "getComputedStyle",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "CustomEvent",
  "MutationObserver",
  "ResizeObserver",
  "AbortController",
  "AbortSignal",
  "FormData",
  "FileReader",
]) {
  if (dom.window[key] === undefined) continue;
  const value =
    key === "getComputedStyle"
      ? dom.window[key].bind(dom.window)
      : dom.window[key];
  try {
    Object.defineProperty(globalThis, key, {
      value,
      configurable: true,
      writable: true,
    });
  } catch {
    /* leave Node's own global in place */
  }
}
globalThis.window.confirm = () => true;

const realFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = (input, init) => {
  const url =
    typeof input === "string" && input.startsWith("/")
      ? BASE + input
      : input;
  return realFetch(url, init);
};

globalThis.localStorage.setItem("todo_token", token);
globalThis.localStorage.setItem("todo_username", username);

// ---- boot the app ---------------------------------------------------------
const assetsDir = path.join(here, "dist", "assets");
const bundle = readdirSync(assetsDir).find((name) => name.endsWith(".js"));
await import(pathToFileURL(path.join(assetsDir, bundle)).href);

console.log("initial render");
await until("tabs render", () =>
  dom.window.document.querySelector('[role="tablist"]'),
);
check("header shows username", normalizedText().includes(username));
check("sign out button", normalizedText().includes("Sign out"));
check("add form", normalizedText().includes("Add a todo"));
check(
  "tab labels",
  ["All", "Open", "Completed"].every((t) => normalizedText().includes(t)),
);
check(
  "priority filter",
  dom.window.document.querySelector("select") !== null,
);

await until("first page items", () => liWithTitle("Task 3"));
check(
  "page one capped at 10",
  dom.window.document.querySelectorAll("li").length === 10,
  `${dom.window.document.querySelectorAll("li").length} items`,
);
await until("open counter", () => /11\s*todos?\s*open/.test(normalizedText()));
check("open counter", true);
const loadMore = await until(
  "load more button",
  () =>
    [...dom.window.document.querySelectorAll("button")].find((b) =>
      b.textContent.startsWith("Load more"),
    ),
);
check(
  "load more shows remaining",
  loadMore.textContent.includes("2 left"),
  loadMore.textContent,
);
const task12 = liWithTitle("Task 12");
check(
  "overdue highlight",
  task12 !== undefined &&
    task12.className.includes("red") &&
    task12.textContent.includes("Overdue"),
  task12?.className,
);

console.log("pagination");
click(loadMore);
await until(
  "all 12 items",
  () => dom.window.document.querySelectorAll("li").length === 12,
);
check("load more hidden when done", !normalizedText().includes("Load more"));

console.log("tabs and filters");
const tabButton = (label) =>
  [...dom.window.document.querySelectorAll('[role="tab"]')].find(
    (b) => b.textContent === label,
  );

click(tabButton("Completed"));
await until(
  "completed list",
  () =>
    liWithTitle("Task 1") !== undefined &&
    dom.window.document.querySelectorAll("li").length === 1,
);
check(
  "completed tab shows only completed",
  dom.window.document.querySelectorAll("li").length === 1,
);

click(tabButton("Open"));
await until("open list", () => liWithTitle("Task 3") !== undefined);
check("open tab hides completed", liWithTitle("Task 1") === undefined);
check(
  "open tab first page",
  dom.window.document.querySelectorAll("li").length === 10,
  `${dom.window.document.querySelectorAll("li").length} items`,
);

click(tabButton("All"));
await until("all list", () => liWithTitle("Task 3") !== undefined);

const prioritySelect = [...dom.window.document.querySelectorAll("select")].at(-1);
setSelect(prioritySelect, "high");
await until(
  "high filter applied",
  () => badgeTexts().length > 0 && badgeTexts().every((b) => b === "high"),
);
check("priority filter narrows list", badgeTexts().length > 0, badgeTexts().join(","));
setSelect(prioritySelect, "all");
await until("filter cleared", () => liWithTitle("Task 3") !== undefined);

console.log("create");
const addForm = dom.window.document.querySelector("form");
setInput(
  addForm.querySelector('[aria-label="Title"]'),
  "Written from the browser",
);
submitForm(addForm);
await until("new todo visible", () => liWithTitle("Written from the browser"));
await until("counter after add", () =>
  /12\s*todos?\s*open/.test(normalizedText()),
);
check("counter after add", true);

console.log("validation message from the API");
const createdLi = liWithTitle("Written from the browser");
click(
  [...createdLi.querySelectorAll("button")].find((b) => b.textContent === "Edit"),
);
const editTitle = await until("edit field", () =>
  createdLi.querySelector('[aria-label="Title"]'),
);
setInput(editTitle, "   ");
const saveBtn = [...createdLi.querySelectorAll("button")].find(
  (b) => b.textContent === "Save",
);
click(saveBtn);
await until("validation shown", () =>
  createdLi.textContent.includes("title is required"),
);
check("inline edit shows API validation", true);
setInput(
  createdLi.querySelector('[aria-label="Title"]'),
  "Renamed from the browser",
);
click([...createdLi.querySelectorAll("button")].find((b) => b.textContent === "Save"));
await until("renamed", () =>
  liWithTitle("Renamed from the browser") !== undefined,
);
check("inline edit saves", true);

console.log("checkbox saves immediately");
const toggleLi = await until("task 12 present", () => liWithTitle("Task 12"));
const checkbox = toggleLi.querySelector('input[type="checkbox"]');
check("task 12 open before toggle", checkbox.checked === false);
click(checkbox);
await until("toggle applied", () => {
  const li = liWithTitle("Task 12");
  return li === undefined || li.querySelector("input[type=checkbox]").checked;
});
await until("counter after toggle", () =>
  /11\s*todos?\s*open/.test(normalizedText()),
);
check("counter after toggle", true);

console.log("delete asks for confirmation");
let confirmations = 0;
globalThis.window.confirm = () => {
  confirmations += 1;
  return true;
};
const task4Li = await until("task 4 present", () => liWithTitle("Task 4"));
click([...task4Li.querySelectorAll("button")].find((b) => b.textContent === "Delete"));
await until("task 4 removed", () => liWithTitle("Task 4") === undefined);
check("confirm called once", confirmations === 1, `${confirmations}`);
await until("counter after delete", () =>
  /10\s*todos?\s*open/.test(normalizedText()),
);
check("counter after delete", true);

console.log("sign out");
click(buttonByText("Sign out"));
await until("auth screen", () => normalizedText().includes("Sign in"));
check("token cleared", globalThis.localStorage.getItem("todo_token") === null);

console.log("sign-in shows API error");
const signinForm = dom.window.document.querySelector("form");
setInput(signinForm.querySelector("#username"), username);
setInput(signinForm.querySelector("#password"), "wrong-password");
submitForm(signinForm);
await until("login error", () =>
  normalizedText().includes("invalid username or password"),
);
check("login error displayed", true);

console.log("sign in for real");
setInput(signinForm.querySelector("#password"), password);
submitForm(signinForm);
await until("back in app", () =>
  dom.window.document.querySelector('[role="tablist"]'),
);
check("signed in again", normalizedText().includes(username));

console.log("register a fresh account through the UI");
click(buttonByText("Sign out"));
await until("auth screen again", () =>
  normalizedText().includes("Sign in"),
);
click(buttonByText("Create account"));
await until("register form", () =>
  normalizedText().includes("Create an account"),
);
const registerForm = dom.window.document.querySelector("form");
const fresh = `fresh_${stamp}`;
setInput(registerForm.querySelector("#username"), fresh);
setInput(registerForm.querySelector("#password"), "pw12345");
submitForm(registerForm);
await until("new account header", () => normalizedText().includes(fresh));
check("registered and signed in", normalizedText().includes("Sign out"));
await until("empty state", () =>
  normalizedText().includes("No todos yet"),
);
check("empty state shown", true);
await until("counter zero", () => /0\s*todos?\s*open/.test(normalizedText()));
check("counter zero", true);

console.log();
if (failures.length) {
  console.log(`${failures.length} FAILURES: ${failures.join(", ")}`);
  process.exit(1);
}
console.log("frontend smoke test passed");
process.exit(0);

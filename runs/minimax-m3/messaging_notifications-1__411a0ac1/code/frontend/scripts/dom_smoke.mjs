import { build } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync, rmSync } from "node:fs";
import { JSDOM } from "jsdom";

const outDir = "dist-test";
rmSync(outDir, { recursive: true, force: true });

await build({
  root: process.cwd(),
  configFile: false,
  logLevel: "warn",
  plugins: [react(), tailwindcss()],
  build: {
    outDir,
    emptyOutDir: true,
    cssCodeSplit: false,
    minify: false,
    lib: {
      entry: "scripts/test-entry.tsx",
      name: "TestEntry",
      formats: ["iife"],
      fileName: () => "test-entry.js",
    },
  },
});

const bundle = readFileSync(`${outDir}/test-entry.js`, "utf8");

const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
  url: "http://localhost:5173/",
  runScripts: "dangerously",
  pretendToBeVisual: true,
});

const realFetch = globalThis.fetch;
dom.window.process = { env: { NODE_ENV: "production" } };
dom.window.fetch = (input, init) => {
  const url = typeof input === "string" ? input : input.url;
  return realFetch(`http://127.0.0.1:8000${url}`, init);
};

const script = dom.window.document.createElement("script");
script.textContent = bundle;
dom.window.document.body.appendChild(script);

const container = dom.window.document.getElementById("root");
const results = [];

function check(label, condition, extra = "") {
  results.push({ label, ok: Boolean(condition) });
  console.log(`${condition ? "ok  " : "FAIL"} ${label}${condition ? "" : ` -> ${extra}`}`);
}

function text() {
  return container.textContent ?? "";
}

function byText(selector, needle) {
  return [...container.querySelectorAll(selector)].find((el) =>
    (el.textContent ?? "").trim().toLowerCase().includes(needle.toLowerCase()),
  );
}

function setInputValue(element, value) {
  const proto =
    element.tagName === "TEXTAREA"
      ? dom.window.HTMLTextAreaElement.prototype
      : dom.window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
  setter.call(element, value);
  element.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
}

const settle = (ms = 120) => new Promise((resolve) => setTimeout(resolve, ms));

async function click(element) {
  element.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  await settle();
}

dom.window.TestEntry.mount(container);
await settle(200);

check("auth panel renders", text().includes("Sign in"), text().slice(0, 150));
check("register tab present", text().includes("Register"), text().slice(0, 150));

const usernameInput = container.querySelector('input[name="username"]');
const passwordInput = container.querySelector('input[name="password"]');
check("username input", Boolean(usernameInput));
check("password input", Boolean(passwordInput));

const username = `domtest${Date.now()}`;
setInputValue(usernameInput, username);
setInputValue(passwordInput, "secret123");
await click(byText("button", "Register"));
check("register form shown", Boolean(byText("button", "Create account")), text().slice(0, 200));

await click(byText("button", "Create account"));
check("signed in, username shown", text().includes(username), text().slice(0, 200));
check("sign out button", Boolean(byText("button", "Sign out")));
check("bell unread count present", Boolean(container.querySelector('[data-testid="unread-count"]')));
check("add notification form", text().includes("Add notification"), text().slice(0, 200));
check("broadcast hidden for normal user", !text().includes("Broadcast announcement"));
check("mark all as read button", Boolean(byText("button", "Mark all as read")));
check(
  "filter selects present",
  container.querySelectorAll("select").length >= 3,
  String(container.querySelectorAll("select").length),
);

const textarea = container.querySelector("textarea");
setInputValue(textarea, "dom test message");
await click(byText("button", "Add"));
check("notification added", text().includes("dom test message"), text().slice(0, 300));
check(
  "unread count is 1",
  container.querySelector('[data-testid="unread-count"]')?.textContent === "1",
  container.querySelector('[data-testid="unread-count"]')?.textContent ?? "",
);

await click(byText("button", "Mark as read"));
check(
  "unread count is 0 after read",
  container.querySelector('[data-testid="unread-count"]')?.textContent === "0",
  container.querySelector('[data-testid="unread-count"]')?.textContent ?? "",
);
check("toggle shows mark as unread", Boolean(byText("button", "Mark as unread")));

const unreadSelect = [...container.querySelectorAll("select")][0];
unreadSelect.value = "unread";
unreadSelect.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
await settle(200);
check("unread filter hides read item", !text().includes("dom test message"), text().slice(0, 300));

await click(byText("button", "Delete"));
await settle(200);

await click(byText("button", "Sign out"));
check("signed out", text().includes("Sign in"), text().slice(0, 150));

const failed = results.filter((result) => !result.ok);
console.log(`\npassed: ${results.length - failed.length}  failed: ${failed.length}`);
process.exit(failed.length === 0 ? 0 : 1);

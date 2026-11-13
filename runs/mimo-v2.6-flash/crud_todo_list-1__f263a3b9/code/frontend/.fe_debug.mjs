import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { JSDOM, VirtualConsole } from "jsdom";

const BASE = "http://localhost:8000";
const here = path.dirname(fileURLToPath(import.meta.url));

const stamp = Date.now();
const username = `dbg_${stamp}`;
await fetch(BASE + "/api/auth/register", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username, password: "pw" }),
});
const login = await fetch(BASE + "/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username, password: "pw" }),
});
const { token } = await login.json();
for (let i = 1; i <= 3; i += 1) {
  await fetch(BASE + "/api/todos", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ title: `Task ${i}` }),
  });
}

const virtualConsole = new VirtualConsole();
virtualConsole.on("error", (...args) => console.log("CONSOLE ERROR:", ...args));
virtualConsole.on("warn", (...args) => console.log("CONSOLE WARN:", ...args));
virtualConsole.on("jsdomError", (err) => console.log("JSDOM ERROR:", err.message, err.stack?.split("\n").slice(0, 5).join(" | ")));
virtualConsole.on("log", (...args) => console.log("CONSOLE LOG:", ...args));

const dom = new JSDOM(
  '<!DOCTYPE html><html><body><div id="root"></div></body></html>',
  { url: BASE + "/", pretendToBeVisual: true, virtualConsole },
);

for (const key of [
  "window", "document", "localStorage", "sessionStorage", "navigator",
  "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement", "HTMLSelectElement",
  "Element", "Node", "Event", "MouseEvent", "KeyboardEvent", "getComputedStyle",
  "requestAnimationFrame", "cancelAnimationFrame", "CustomEvent",
  "MutationObserver", "ResizeObserver", "AbortController", "AbortSignal",
  "FormData", "FileReader",
]) {
  if (dom.window[key] === undefined) continue;
  const value = key === "getComputedStyle" ? dom.window[key].bind(dom.window) : dom.window[key];
  try {
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  } catch { /* ignore */ }
}

const realFetch = globalThis.fetch.bind(globalThis);
let fetchCount = 0;
globalThis.fetch = (input, init) => {
  const url = typeof input === "string" && input.startsWith("/") ? BASE + input : input;
  fetchCount += 1;
  console.log(`FETCH #${fetchCount}: ${init?.method ?? "GET"} ${url}`);
  return realFetch(url, init).then(async (res) => {
    console.log(`  -> ${res.status}`);
    return res;
  });
};

globalThis.localStorage.setItem("todo_token", token);
globalThis.localStorage.setItem("todo_username", username);

dom.window.addEventListener("error", (event) => {
  console.log("WINDOW ERROR:", event.message, event.error?.stack?.split("\n").slice(0, 6).join(" | "));
});

const assetsDir = path.join(here, "dist", "assets");
const bundle = readdirSync(assetsDir).find((n) => n.endsWith(".js"));
console.log("importing", bundle);
try {
  await import(pathToFileURL(path.join(assetsDir, bundle)).href);
} catch (err) {
  console.log("IMPORT ERROR:", err.message, err.stack?.split("\n").slice(0, 6).join(" | "));
}

for (let i = 0; i < 15; i += 1) {
  await new Promise((r) => setTimeout(r, 300));
  const text = (dom.window.document.body.textContent || "").replace(/\s+/g, " ").slice(0, 220);
  const lis = dom.window.document.querySelectorAll("li").length;
  console.log(`t=${(i + 1) * 300}ms lis=${lis} rootChildren=${dom.window.document.getElementById("root")?.childElementCount} :: ${text}`);
}
process.exit(0);

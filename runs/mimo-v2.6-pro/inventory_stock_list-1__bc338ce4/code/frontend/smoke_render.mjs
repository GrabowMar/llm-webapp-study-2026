/* Temporary render smoke test: mounts the production bundle in jsdom. */
import { readdirSync } from "node:fs";
import { JSDOM } from "jsdom";

const BASE = "http://localhost:8000";
const dist = new URL("./dist/assets/", import.meta.url);
const bundleName = readdirSync(dist).find((f) => f.endsWith(".js"));
const bundleUrl = new URL(bundleName, dist).href;

const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => realFetch(new URL(input, BASE), init);

async function getToken() {
  const res = await realFetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "e2e_user", password: "hunter2!" }),
  });
  return (await res.json()).token;
}

const token = await getToken();

const itemRes = await realFetch(`${BASE}/api/items?page_size=1`);
const firstItem = (await itemRes.json()).items[0];

const fails = [];
function check(name, cond, detail = "") {
  if (cond) console.log(`ok   ${name}`);
  else {
    fails.push(name);
    console.log(`FAIL ${name} ${detail}`);
  }
}

async function renderAt(path, expected, forbidden = [], { authed = true } = {}) {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', {
    url: BASE + path,
    pretendToBeVisual: true,
  });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
  globalThis.localStorage = dom.window.localStorage;
  for (const key of [
    "Event",
    "CustomEvent",
    "MutationObserver",
    "HTMLElement",
    "HTMLInputElement",
    "HTMLIFrameElement",
    "Element",
    "Node",
    "DocumentFragment",
    "SVGElement",
    "getComputedStyle",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    "MessageChannel",
    "Blob",
    "File",
    "FileReader",
    "FormData",
    "AbortController",
  ]) {
    if (dom.window[key] !== undefined) globalThis[key] = dom.window[key];
  }
  if (authed) {
    dom.window.localStorage.setItem("inventory.token", token);
    dom.window.localStorage.setItem("inventory.username", "e2e_user");
  }

  try {
    await import(`${bundleUrl}?v=${Date.now()}-${Math.random()}`);
  } catch (err) {
    check(`${path} bundle loaded`, false, String(err));
    dom.window.close();
    return;
  }
  await new Promise((r) => setTimeout(r, 600));

  const text = dom.window.document.body.textContent ?? "";
  for (const needle of expected) {
    check(`${path} shows "${needle}"`, text.includes(needle), `text=${JSON.stringify(text.slice(0, 200))}`);
  }
  for (const needle of forbidden) {
    check(`${path} hides "${needle}"`, !text.includes(needle));
  }
  dom.window.close();
}

await renderAt("/", ["Warehouse Inventory", "Inventory", "Search", "Low stock only", "Add item", "Signed in as", "e2e_user", "Sign out", firstItem.name, firstItem.sku, "Previous", "Next", "Low stock"]);
await renderAt("/account", ["You are signed in", "Go to inventory"], ["Username"]);
await renderAt("/account", ["Sign in", "Create an account", "Username", "Password", "Register", "Sign in to manage items"], ["Signed in as"], { authed: false });
await renderAt("/", ["Sign in to manage items", firstItem.name], ["Sign out", "Add item"], { authed: false });
await renderAt(`/items/${firstItem.id}`, [firstItem.name, "Receive stock", "Take out stock", "Stock movements", "Edit", "Delete", "Reorder level", "Change", "Quantity after"]);
await renderAt("/items/new", ["Add item", "Name", "SKU", "Location", "Reorder level", "Opening quantity"]);

console.log();
console.log("FAILURES:", fails.length ? fails : "none");
process.exit(fails.length ? 1 : 0);

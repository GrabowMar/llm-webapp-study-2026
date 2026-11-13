/* Temporary interaction smoke test: drives the production bundle in jsdom. */
import { readdirSync } from "node:fs";
import { JSDOM } from "jsdom";

const BASE = "http://localhost:8000";
const dist = new URL("./dist/assets/", import.meta.url);
const bundleName = readdirSync(dist).find((f) => f.endsWith(".js"));
const bundleUrl = new URL(bundleName, dist).href;

const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => realFetch(new URL(input, BASE), init);

const fails = [];
function check(name, cond, detail = "") {
  if (cond) console.log(`ok   ${name}`);
  else {
    fails.push(name);
    console.log(`FAIL ${name} ${detail}`);
  }
}

const login = await realFetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "e2e_user", password: "hunter2!" }),
});
const token = (await login.json()).token;
const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

const create = await realFetch(`${BASE}/api/items`, {
  method: "POST",
  headers,
  body: JSON.stringify({ name: "Interact Widget", sku: `IX-${Date.now()}`, location: "Z9", quantity: 10, reorder_level: 3 }),
});
const item = await create.json();

async function mount(path) {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', {
    url: BASE + path,
    pretendToBeVisual: true,
  });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
  globalThis.localStorage = dom.window.localStorage;
  for (const key of [
    "Event", "CustomEvent", "MutationObserver", "HTMLElement", "HTMLInputElement",
    "HTMLIFrameElement", "Element", "Node", "DocumentFragment", "SVGElement",
    "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "MessageChannel",
    "Blob", "File", "FileReader", "FormData", "AbortController",
  ]) {
    if (dom.window[key] !== undefined) globalThis[key] = dom.window[key];
  }
  dom.window.localStorage.setItem("inventory.token", token);
  dom.window.localStorage.setItem("inventory.username", "e2e_user");
  await import(`${bundleUrl}?v=${Date.now()}-${Math.random()}`);
  await new Promise((r) => setTimeout(r, 500));
  return dom;
}

function setValue(input, value) {
  const setter = Object.getOwnPropertyDescriptor(input.constructor.prototype, "value").set;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function submitForm(form) {
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

function buttonByText(text) {
  return [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === text);
}

// --- item page: receive updates the shown quantity
{
  const dom = await mount(`/items/${item.id}`);
  const text = () => document.body.textContent ?? "";
  check("item page shows quantity 10", /Quantity\s*10/.test(text()), text().slice(0, 300));

  const numbers = [...document.querySelectorAll('input[type="number"]')];
  setValue(numbers[0], "7");
  submitForm(numbers[0].form);
  await new Promise((r) => setTimeout(r, 600));
  check("receive updates quantity to 17", /Quantity\s*17/.test(text()), text().slice(0, 400));
  check("movement row shows +7", text().includes("+7"), text().slice(0, 400));
  check("receive clears form", numbers[0].value === "");

  setValue(numbers[1], "999999");
  submitForm(numbers[1].form);
  await new Promise((r) => setTimeout(r, 600));
  check("take-out below zero refused", text().includes("below zero"), text().slice(0, 400));
  check("quantity unchanged after refusal", /Quantity\s*17/.test(text()), text().slice(0, 400));

  setValue(numbers[1], "5");
  const reason = document.getElementById(`${item.id}-reason--1`);
  setValue(reason, "damaged");
  submitForm(numbers[1].form);
  await new Promise((r) => setTimeout(r, 600));
  check("take out updates quantity to 12", /Quantity\s*12/.test(text()), text().slice(0, 400));
  check("take-out reason shown", text().includes("damaged"), text().slice(0, 400));
  check("take-out delta shown", text().includes("-5"), text().slice(0, 400));
  dom.window.close();
}

// --- add form shows API validation messages
{
  const dom = await mount("/items/new");
  const text = () => document.body.textContent ?? "";
  submitForm(document.getElementById("item-name").form);
  await new Promise((r) => setTimeout(r, 600));
  check("empty form shows api error", text().includes("name is required") && text().includes("sku is required"), text().slice(0, 400));

  setValue(document.getElementById("item-name"), "Dup");
  setValue(document.getElementById("item-sku"), item.sku);
  setValue(document.getElementById("item-quantity"), "5");
  submitForm(document.getElementById("item-name").form);
  await new Promise((r) => setTimeout(r, 600));
  check("duplicate sku message shown", text().toLowerCase().includes("duplicate sku"), text().slice(0, 400));
  check("duplicate message mentions sku value", text().includes(item.sku), text().slice(0, 400));
  dom.window.close();
}

// --- edit form shows api validation messages and saves
{
  const dom = await mount(`/items/${item.id}/edit`);
  const text = () => document.body.textContent ?? "";
  check("edit prefills name", document.getElementById("item-name").value === item.name);
  setValue(document.getElementById("item-name"), "");
  submitForm(document.getElementById("item-name").form);
  await new Promise((r) => setTimeout(r, 600));
  check("edit shows api error", text().includes("name is required"), text().slice(0, 400));

  setValue(document.getElementById("item-name"), `${item.name} v2`);
  submitForm(document.getElementById("item-name").form);
  await new Promise((r) => setTimeout(r, 800));
  check("edit navigates to item", text().includes(`${item.name} v2`), text().slice(0, 400));
  check("edit keeps quantity", /Quantity\s*12/.test(text()), text().slice(0, 400));
  dom.window.close();
}

// --- delete asks for confirmation
{
  const dom = await mount(`/items/${item.id}`);
  let asked = "";
  dom.window.confirm = (msg) => {
    asked = msg;
    return true;
  };
  const text = () => document.body.textContent ?? "";
  buttonByText("Delete").click();
  await new Promise((r) => setTimeout(r, 800));
  check("delete asked for confirmation", asked.includes(item.name), asked);
  check("delete navigates to list", text().includes("Inventory") && !text().includes(`${item.name} v2`), text().slice(0, 300));
  const after = await realFetch(`${BASE}/api/items/${item.id}`);
  check("item really deleted", after.status === 404, String(after.status));
  dom.window.close();
}

console.log();
console.log("FAILURES:", fails.length ? fails : "none");
process.exit(fails.length ? 1 : 0);

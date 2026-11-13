import { JSDOM } from "jsdom";

const BASE = "http://127.0.0.1:8000";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function assert(condition, label, detail = "") {
  if (!condition) throw new Error(`ASSERT FAILED: ${label} ${detail}`);
}

async function api(method, path, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

// ---- API setup ----------------------------------------------------------
const username = `smoke${Date.now()}`;
let res = await api("POST", "/api/auth/register", { username, password: "pw123456" });
assert(res.status === 201, "register", JSON.stringify(res));
res = await api("POST", "/api/auth/login", { username, password: "pw123456" });
assert(res.status === 200 && res.body.token, "login", JSON.stringify(res));
const token = res.body.token;

for (const item of [
  { name: "Alpha Bolt", sku: "AB-1", location: "Aisle A", quantity: 50, reorder_level: 5 },
  { name: "Zebra Tool", sku: "ZT-1", location: "Aisle B", quantity: 5, reorder_level: 10 },
  { name: "Beta Cable", sku: "BC-1", location: "Aisle A", quantity: 20, reorder_level: 2 },
  ...Array.from({ length: 9 }, (_, i) => ({
    name: `Filler ${String(i + 1).padStart(2, "0")}`,
    sku: `FL-${String(i + 1).padStart(2, "0")}`,
    location: "Aisle C",
    quantity: 100,
    reorder_level: 5,
  })),
]) {
  res = await api("POST", "/api/items", item, token);
  assert(res.status === 201, `create ${item.sku}`, JSON.stringify(res));
}

// ---- jsdom setup --------------------------------------------------------
const dom = new JSDOM(
  '<!DOCTYPE html><html><body><div id="root"></div></body></html>',
  { url: BASE + "/", pretendToBeVisual: true },
);
const { window } = dom;

for (const key of [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "HTMLInputElement",
  "HTMLSelectElement",
  "HTMLButtonElement",
  "Element",
  "Node",
  "Event",
  "CustomEvent",
  "MouseEvent",
  "KeyboardEvent",
  "localStorage",
  "getComputedStyle",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "MutationObserver",
]) {
  try {
    globalThis[key] = window[key];
  } catch {
    /* read-only global */
  }
}
globalThis.window = window;
globalThis.document = window.document;
window.scrollTo = () => {};

const realFetch = globalThis.fetch;
const wrappedFetch = (input, init) => {
  const url =
    typeof input === "string" && !input.startsWith("http") ? BASE + input : input;
  return realFetch(url, init);
};
globalThis.fetch = wrappedFetch;
window.fetch = wrappedFetch;

const errors = [];
const origError = console.error;
console.error = (...args) => {
  errors.push(args.map(String).join(" "));
  origError(...args);
};

// ---- helpers ------------------------------------------------------------
async function waitFor(predicate, label, timeoutMs = 8000) {
  const start = Date.now();
  for (;;) {
    if (predicate()) return;
    if (Date.now() - start > timeoutMs) {
      throw new Error(
        `TIMEOUT waiting for: ${label}\nBODY: ${window.document.body.innerHTML.slice(0, 3000)}`,
      );
    }
    await sleep(50);
  }
}

const bodyText = () => window.document.body.textContent || "";
const bodyHTML = () => window.document.body.innerHTML;

function setValue(selector, value) {
  const el = window.document.querySelector(selector);
  assert(el, `element ${selector} exists`);
  const proto =
    el.tagName === "SELECT"
      ? window.HTMLSelectElement.prototype
      : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
  el.dispatchEvent(new window.Event("input", { bubbles: true }));
  el.dispatchEvent(new window.Event("change", { bubbles: true }));
}

function findButton(text) {
  const btn = [...window.document.querySelectorAll("button")].find(
    (b) => b.textContent === text,
  );
  assert(btn, `button "${text}" exists`);
  return btn;
}

function clickButton(text) {
  findButton(text).dispatchEvent(
    new window.MouseEvent("click", { bubbles: true, cancelable: true }),
  );
}

function submitVia(text) {
  const btn = findButton(text);
  assert(btn.form, `button "${text}" has a form`);
  btn.form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
}

function go(path) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new window.PopStateEvent("popstate"));
}

function quantityShown() {
  const el = window.document.querySelector("main .text-3xl");
  return el ? (el.textContent || "").replace(/\s+/g, "") : "";
}

// ---- mount --------------------------------------------------------------
window.localStorage.setItem("inventory_token", token);
window.localStorage.setItem("inventory_username", username);

const { mount } = await import("./.smoke/smoke-entry.js");
mount(window.document.getElementById("root"));

// ---- list ---------------------------------------------------------------
await waitFor(() => bodyText().includes("Warehouse Inventory"), "header");
await waitFor(() => bodyText().includes("Alpha Bolt"), "item list loads");
assert(bodyText().includes(username), "signed-in username shown");
assert(
  !window.document.querySelector('a[href="/login"]'),
  "sign-in link hidden when signed in",
);
assert(
  window.document.querySelector(`tr[class*="bg-amber-100"]`)?.textContent?.includes("Zebra Tool"),
  "low-stock row highlighted",
  bodyHTML().slice(0, 800),
);

// search
setValue("#search", "zebra");
await waitFor(
  () => !bodyText().includes("Alpha Bolt") && bodyText().includes("Zebra Tool"),
  "search filters",
);
setValue("#search", "");
await waitFor(() => bodyText().includes("Alpha Bolt"), "search cleared");

// low stock switch
const switchBtn = () => window.document.querySelector(`button[role="switch"]`);
switchBtn().dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
await waitFor(
  () => !bodyText().includes("Alpha Bolt") && bodyText().includes("Zebra Tool"),
  "low stock switch on",
);
switchBtn().dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
await waitFor(() => bodyText().includes("Alpha Bolt"), "low stock switch off");

// location filter
setValue("#location", "Aisle A");
await waitFor(
  () => bodyText().includes("Alpha Bolt") && !bodyText().includes("Zebra Tool"),
  "location filter",
);
setValue("#location", "");
await waitFor(() => bodyText().includes("Zebra Tool"), "location filter cleared");

// paging: 12 items, 10 per page
setValue("#page-size", "10");
await waitFor(
  () => bodyText().includes("Page 1 of 2") && !bodyText().includes("Zebra Tool"),
  "paging page 1",
);
clickButton("Next");
await waitFor(
  () => bodyText().includes("Page 2 of 2") && bodyText().includes("Zebra Tool"),
  "paging page 2",
);
clickButton("Previous");
await waitFor(() => bodyText().includes("Page 1 of 2"), "paging back");
setValue("#page-size", "20");
await waitFor(() => bodyText().includes("Page 1 of 1"), "paging reset");

// ---- add item, with API validation message ------------------------------
go("/items/new");
await waitFor(() => bodyText().includes("Add item"), "add form");
setValue("#name", "Gamma Gadget");
setValue("#sku", "AB-1"); // duplicate SKU
setValue("#item-location", "Aisle C");
setValue("#reorder", "3");
setValue("#quantity", "4");
submitVia("Add item");
await waitFor(() => bodyText().includes("SKU already exists"), "duplicate sku message");
setValue("#sku", "GG-1");
submitVia("Add item");
await waitFor(
  () => window.location.pathname.split("/").length === 3 && bodyText().includes("Gamma Gadget"),
  "navigated to new item",
);
const gammaId = window.location.pathname.split("/")[2];
assert(/^\d+$/.test(gammaId), "gamma id captured", gammaId);

// ---- movements ----------------------------------------------------------
await waitFor(
  () => bodyText().includes("Receive") && bodyText().includes("Take out"),
  "movement forms",
);
assert(quantityShown().startsWith("4"), "opening quantity shown", quantityShown());

// insufficient take-out is refused
setValue("#take-qty", "100");
setValue("#take-reason", "too much");
submitVia("Take out");
await waitFor(() => bodyText().includes("Insufficient stock"), "insufficient stock message");
assert(quantityShown().startsWith("4"), "quantity unchanged after refusal", quantityShown());

// receive
setValue("#receive-qty", "6");
setValue("#receive-reason", "restock");
submitVia("Receive");
await waitFor(() => bodyText().includes("restock"), "receive recorded");
await waitFor(() => quantityShown().startsWith("10"), "quantity updated to 10", quantityShown());
assert(bodyText().includes("+6"), "positive delta shown");

// take out works
setValue("#take-qty", "2");
setValue("#take-reason", "order");
submitVia("Take out");
await waitFor(() => quantityShown().startsWith("8"), "quantity updated to 8", quantityShown());
assert(bodyText().includes("-2"), "negative delta shown");

// ---- edit ----------------------------------------------------------------
go(`/items/${gammaId}/edit`);
await waitFor(() => bodyText().includes("Edit item"), "edit form loads");
await waitFor(
  () => window.document.querySelector("#name")?.value === "Gamma Gadget",
  "edit form prefilled",
);
assert(
  (window.document.body.textContent || "").includes("quantity changes only through stock movements"),
  "edit form shows quantity note",
);
setValue("#name", "Gamma Gadget Pro");
setValue("#sku", "ZT-1"); // duplicate of another item
submitVia("Save changes");
await waitFor(() => bodyText().includes("SKU already exists"), "edit duplicate sku message");
setValue("#sku", "GG-1");
submitVia("Save changes");
await waitFor(() => bodyText().includes("Gamma Gadget Pro"), "edit saved");

// ---- delete asks for confirmation ---------------------------------------
let confirmed = false;
window.confirm = () => {
  confirmed = true;
  return false;
};
const deleteBtn = findButton("Delete item");
deleteBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
assert(confirmed, "delete asks for confirmation");
assert(bodyText().includes("Gamma Gadget Pro"), "item still present when cancelled");

window.confirm = () => true;
deleteBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
await waitFor(() => window.location.pathname === "/", "navigated home after delete");
await waitFor(() => !bodyText().includes("Gamma Gadget Pro"), "item deleted from list");

// ---- sign out -----------------------------------------------------------
clickButton("Sign out");
await waitFor(() => Boolean(window.document.querySelector('a[href="/login"]')), "signed out");
assert(!bodyText().includes(username), "username hidden after sign out");

// signed-out guards
go("/items/new");
await waitFor(() => bodyText().includes("Sign in required"), "add form guard");
go(`/items/${gammaId}`);
await waitFor(
  () => bodyText().includes("not found") || bodyText().includes("Page not found"),
  "missing item handled",
);
go("/login");
await waitFor(
  () => bodyText().includes("Username") && bodyText().includes("Password"),
  "login form",
);

// register page reachable when signed out
go("/register");
await waitFor(() => bodyText().includes("Create an account"), "register form");

// React console.error should not contain crashes
const serious = errors.filter(
  (line) => !line.includes("not wrapped in act") && !line.includes("Warning:"),
);
assert(serious.length === 0, "no react errors", serious.slice(0, 3).join(" | "));

console.log("SMOKE OK");

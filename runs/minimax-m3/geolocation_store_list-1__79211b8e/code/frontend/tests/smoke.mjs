/**
 * Smoke test for the built frontend bundle.
 *
 * Loads the production bundle in jsdom against a stubbed API and checks that
 * the store list, the search box, the location button and the admin flows
 * behave.
 *
 * Run with: node frontend/tests/smoke.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, "..", "dist");

const stores = [
  {
    id: 1,
    name: "Alte Post Markt",
    address: "Hauptstrasse 12, 10115 Berlin",
    phone: "+49 30 5550101",
    latitude: 52.5291,
    longitude: 13.405,
    distance_km: null,
  },
  {
    id: 2,
    name: "HafenCity Provisions",
    address: "Am Sandtorkai 42, 20457 Hamburg",
    phone: null,
    latitude: 53.5411,
    longitude: 9.9931,
    distance_km: null,
  },
];

const requests = [];
let adminToken = null;

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: "http://localhost/",
  pretendToBeVisual: true,
});

const { window } = dom;
globalThis.window = window;
globalThis.document = window.document;
Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true });
globalThis.HTMLElement = window.HTMLElement;
globalThis.Element = window.Element;
globalThis.Node = window.Node;
globalThis.Event = window.Event;
globalThis.MouseEvent = window.MouseEvent;
globalThis.KeyboardEvent = window.KeyboardEvent;
globalThis.getComputedStyle = window.getComputedStyle;
globalThis.MutationObserver = window.MutationObserver;
globalThis.CustomEvent = window.CustomEvent;
globalThis.location = window.location;
globalThis.history = window.history;
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);

const storage = new Map();
Object.defineProperty(window, "localStorage", {
  value: {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
    clear: () => storage.clear(),
  },
});

globalThis.fetch = async (url, init = {}) => {
  requests.push(`${init.method ?? "GET"} ${url}`);
  const path = String(url);
  if (path.startsWith("/api/stores")) {
    const parsed = new URL(path, "http://localhost");
    const lat = parsed.searchParams.get("lat");
    const lng = parsed.searchParams.get("lng");
    const radius = parsed.searchParams.get("radius");
    let items = stores;
    if (lat && lng) {
      items = stores.map((store) => ({
        ...store,
        distance_km:
          Math.round(Math.hypot(store.latitude - Number(lat), store.longitude - Number(lng)) * 100) /
          100,
      }));
      if (radius) {
        items = items.filter((store) => store.distance_km <= Number(radius));
      }
    }
    return jsonResponse({ items });
  }
  if (path.startsWith("/api/auth/me")) {
    return jsonResponse({ user: { username: "admin", is_admin: true } });
  }
  if (path.startsWith("/api/auth/login")) {
    adminToken = "test-token";
    return jsonResponse({ token: adminToken, username: "admin", is_admin: true });
  }
  if (path.startsWith("/api/admin/stores") && (init.method ?? "GET") === "DELETE") {
    return { ok: true, status: 204, text: async () => "" };
  }
  return jsonResponse({ error: "not found" }, 404);
};

const assets = join(dist, "assets");
const bundle = readdirSync(assets).find((file) => file.endsWith(".js"));
if (!bundle) {
  throw new Error("No built bundle found. Run `npm run build` first.");
}

await import(pathToFileURL(join(assets, bundle)).href);

const failures = [];

function check(label, condition, extra = "") {
  if (condition) {
    console.log(`ok   ${label}`);
  } else {
    failures.push(`${label} ${extra}`);
    console.log(`FAIL ${label} ${extra}`);
  }
}

function wait(ms = 120) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function html() {
  return window.document.body.innerHTML;
}

function byText(selector, text) {
  return Array.from(window.document.querySelectorAll(selector)).find((element) =>
    (element.textContent ?? "").trim().includes(text),
  );
}

function setNativeValue(element, value) {
  const prototype =
    element.tagName === "SELECT"
      ? window.HTMLSelectElement.prototype
      : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value").set;
  setter.call(element, value);
  element.dispatchEvent(new window.Event("input", { bubbles: true }));
  element.dispatchEvent(new window.Event("change", { bubbles: true }));
}

function click(element) {
  element.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
}

await wait(300);

check("renders the heading", html().includes("Store finder"));
check("lists the seeded stores", html().includes("Alte Post Markt"));
check("shows an address", html().includes("Hauptstrasse 12, 10115 Berlin"));
check("shows a phone number", html().includes("+49 30 5550101"));
check("renders the search box", html().includes("Search stores"));
check("renders the location button", html().includes("Use my location"));
check("renders the radius selector", html().includes("Radius"));
check("renders the map plot", html().includes("Latitude / longitude plot"));
check(
  "requests the store list",
  requests.some((entry) => entry.startsWith("GET /api/stores")),
  JSON.stringify(requests),
);
check(
  "plots the stores in the svg",
  html().includes("<svg") && html().includes("Alte Post Markt</text>"),
);

const searchInput = window.document.querySelector('input[type="search"]');
setNativeValue(searchInput, "berlin");
await wait(500);
check(
  "searches through the api",
  requests.some((entry) => entry.includes("/api/stores?q=berlin")),
  JSON.stringify(requests),
);

Object.defineProperty(window.navigator, "geolocation", {
  configurable: true,
  value: {
    getCurrentPosition: (_ok, fail) =>
      fail({ code: 1, PERMISSION_DENIED: 1, message: "denied" }),
  },
});
click(byText("button", "Use my location"));
await wait(200);
check(
  "shows a note when location permission is denied",
  html().includes("Location permission denied"),
);
check("keeps the plain list after a denied location", html().includes("Alte Post Markt"));
check(
  "does not request coordinates after a denied location",
  !requests.some((entry) => entry.includes("lat=")),
  JSON.stringify(requests),
);

click(byText("button", "Admin sign-in"));
await wait(120);
check("opens the sign-in form", html().includes("Admin sign-in</h2>"));
const passwordInput = window.document.querySelector('input[type="password"]');
setNativeValue(passwordInput, "adminpass");
const usernameInput = window.document.querySelector('input[name="username"]');
setNativeValue(usernameInput, "admin");
await wait(120);
const form = window.document.querySelector("form");
form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
await wait(300);
check("signs the admin in", adminToken !== null);
check("shows the directory management panel", html().includes("Manage directory"));
check("stores the token", storage.get("store-finder.token") === "test-token");
check(
  "shows edit and delete actions",
  html().includes("Edit") && html().includes("Delete"),
);

click(byText("button", "Delete"));
await wait(120);
check("asks for delete confirmation", html().includes("Delete this store?"));

click(byText("button", "Add store"));
await wait(120);
check("opens the add form", html().includes("Add a store"));

Object.defineProperty(window.navigator, "geolocation", {
  configurable: true,
  value: {
    getCurrentPosition: (ok) =>
      ok({ coords: { latitude: 52.52, longitude: 13.405 } }),
  },
});
click(byText("button", "Use my location"));
await wait(300);
check(
  "requests nearby stores with the radius",
  requests.some((entry) =>
    entry.includes("lat=52.52") && entry.includes("lng=13.405") && entry.includes("radius=10"),
  ),
  JSON.stringify(requests),
);
check("shows the distance to each store", html().includes("km away"));
check("plots the visitor", html().includes("You are here"));

const radiusSelect = window.document.querySelector("select");
setNativeValue(radiusSelect, "50");
await wait(300);
check(
  "re-queries when the radius changes",
  requests.some((entry) => entry.includes("radius=50")),
  JSON.stringify(requests),
);

click(byText("button", "Clear location"));
await wait(300);
check(
  "drops the coordinates when the location is cleared",
  requests.at(-1).startsWith("GET /api/stores?q="),
  requests.at(-1),
);

const indexHtml = readFileSync(join(dist, "index.html"), "utf8");
check("ships a stylesheet", /assets\/.*\.css/.test(indexHtml));

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log("\nfrontend smoke test passed");

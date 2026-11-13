/* jsdom smoke test: drives the built UI against the live API on :8000. */

import { JSDOM } from "jsdom";
import { pathToFileURL } from "node:url";

const API = "http://localhost:8000";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let passed = 0;
const failures = [];
function check(label, condition, detail = "") {
  if (condition) passed += 1;
  else failures.push(`${label} ${detail}`);
}

async function until(predicate, label, timeout = 6000) {
  const start = Date.now();
  for (;;) {
    let value;
    try {
      value = predicate();
    } catch {
      value = null;
    }
    if (value) return value;
    if (Date.now() - start > timeout) {
      failures.push(`timeout waiting for: ${label}`);
      return null;
    }
    await sleep(40);
  }
}

/* ---------------------------------------------------------- DOM globals */

const dom = new JSDOM(
  '<!DOCTYPE html><html><body><div id="root"></div></body></html>',
  { url: `${API}/`, pretendToBeVisual: true },
);
const { window } = dom;

for (const key of Object.getOwnPropertyNames(window)) {
  if (key in globalThis && ["navigator", "fetch", "crypto"].includes(key)) {
    continue;
  }
  if (!(key in globalThis)) {
    try {
      Object.defineProperty(globalThis, key, {
        value: window[key],
        configurable: true,
        writable: true,
      });
    } catch {
      /* skip */
    }
  }
}
window.scrollTo = () => {};
window.confirm = () => true;

const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) =>
  realFetch(
    typeof input === "string" ? new URL(input, API).href : input,
    init,
  );
window.fetch = globalThis.fetch;

/* ------------------------------------------------------------ build app */

const esbuild = await import("esbuild");
await esbuild.build({
  entryPoints: ["/workspace/frontend/src/main.tsx"],
  bundle: true,
  outfile: "/workspace/.smoketest/app.bundle.js",
  platform: "browser",
  format: "esm",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"development"' },
  loader: { ".css": "empty" },
  logLevel: "error",
});

const doc = window.document;
const $ = (selector) => doc.querySelector(selector);
const $$ = (selector) => [...doc.querySelectorAll(selector)];
const byText = (selector, needle) =>
  $$(selector).find((el) => (el.textContent || "").includes(needle));

function setValue(el, value) {
  const proto =
    el.tagName === "SELECT"
      ? window.HTMLSelectElement.prototype
      : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
  el.dispatchEvent(
    new window.Event(el.tagName === "SELECT" ? "change" : "input", {
      bubbles: true,
    }),
  );
}
function click(el) {
  el.dispatchEvent(
    new window.MouseEvent("click", { bubbles: true, cancelable: true }),
  );
}
function submit(form) {
  form.dispatchEvent(
    new window.Event("submit", { bubbles: true, cancelable: true }),
  );
}
async function api(method, path, body) {
  const auth = JSON.parse(
    window.localStorage.getItem("sensor-dashboard.auth") || "null",
  );
  const res = await realFetch(`${API}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: `Bearer ${auth.token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

/* ------------------------------------------------------------- run app */

await import(pathToFileURL("/workspace/.smoketest/app.bundle.js").href);

const step1 = await until(
  () => text() && text().includes("No sensors registered yet."),
  "dashboard initial render",
);
function text() {
  return $("#root")?.textContent || "";
}

check("dashboard renders publicly", Boolean(step1));
check(
  "auth forms shown when signed out",
  Boolean(byText("button", "Create account") && $("#auth-username")),
);

/* sign up + sign in through the form */
click(byText("button", "Create account"));
await until(
  () => byText("button", "Create account")?.className.includes("bg-slate-900"),
  "register tab active",
);
setValue($("#auth-username"), "smoke_user");
setValue($("#auth-password"), "sup3rsecret");
submit($("#auth-username").closest("form"));
const signedIn = await until(
  () => text().includes("Signed in as") && text().includes("smoke_user"),
  "signed-in header",
);
check("register + auto-login via form", Boolean(signedIn));
check(
  "signed-in forms shown",
  Boolean(
    text().includes("Register a sensor") && text().includes("Post a reading"),
  ),
);

/* register a sensor through the form */
setValue($("#sensor-name"), "Smoke Thermometer");
setValue($("#sensor-unit"), "°C");
setValue($("#sensor-location"), "Test Bench");
submit($("#sensor-name").closest("form"));
const card = await until(
  () => $$(".grid article").find((a) => a.textContent.includes("Smoke Thermometer")),
  "sensor card appears",
);
check("sensor card created", Boolean(card));
check(
  "card empty state",
  Boolean(card && card.textContent.includes("No readings yet")),
);
check(
  "card shows owner + location",
  Boolean(card && card.textContent.includes("Owned by smoke_user") &&
    card.textContent.includes("Test Bench")),
);

/* post a reading through the form */
setValue($("#reading-value"), "21.4");
submit($("#reading-value").closest("form"));
await until(
  () => {
    const c = $$(".grid article").find((a) =>
      a.textContent.includes("Smoke Thermometer"),
    );
    return c && c.textContent.includes("21.4");
  },
  "latest value on card",
);
const updatedCard = $$(".grid article").find((a) =>
  a.textContent.includes("Smoke Thermometer"),
);
check("latest value on card", Boolean(updatedCard?.textContent.includes("21.4")));
check(
  "unit on card",
  Boolean(updatedCard?.textContent.includes("°C")),
);
check(
  "time ago on card",
  Boolean(
    updatedCard &&
      /(Updated (just now|\d+s ago|\d+m ago|\d+h ago|\d+d ago))/.test(
        updatedCard.textContent,
      ),
  ),
);

/* 10 second auto-refresh: write directly through the API, watch the card */
const { body: sensors } = await api("GET", "/api/sensors");
const sensorId = sensors.items.find(
  (s) => s.name === "Smoke Thermometer",
)?.id;
await api("POST", `/api/sensors/${sensorId}/readings`, { value: 99.9 });
const refreshed = await until(
  () => {
    const c = $$(".grid article").find((a) =>
      a.textContent.includes("Smoke Thermometer"),
    );
    return c && c.textContent.includes("99.9");
  },
  "10s auto-refresh picks up external reading",
  14000,
);
check("page refreshes every 10 seconds", Boolean(refreshed));

/* open the sensor page */
click(
  $$(".grid article")
    .find((a) => a.textContent.includes("Smoke Thermometer"))
    .querySelector("a"),
);
const detail = await until(
  () => text().includes("Recent readings") && Boolean($("svg")),
  "sensor page",
);
check("sensor page renders", Boolean(detail));
check(
  "line chart present",
  Boolean($("svg path") && $("svg").getAttribute("viewBox")),
);
await until(
  () => $$("table tbody tr").length === 2,
  "two rows in readings table",
);
check("readings table rows", $$("table tbody tr").length === 2);
check(
  "total shown",
  Boolean(text().includes("2 total") || text().includes("of 2")),
);
check(
  "table values newest first",
  Boolean(
    $("table tbody tr")?.textContent.includes("99.9"),
  ),
);
check(
  "detail header meta",
  Boolean(
    text().includes("Owned by smoke_user") && text().includes("Test Bench"),
  ),
);

/* post another reading from the sensor page */
setValue($("#reading-value"), "42");
submit($("#reading-value").closest("form"));
await until(
  () => $$("#table tbody tr, table tbody tr").length === 3 ||
    $$("table tbody tr").length === 3,
  "third reading row",
);
check("sensor page posting", $$("table tbody tr").length === 3);

/* back to dashboard, delete with confirmation */
click($("a[href='/']"));
const back = await until(
  () => text().includes("Register a sensor"),
  "back on dashboard",
);
check("back to dashboard", Boolean(back));
const before = (await api("GET", "/api/sensors")).body.items.length;
const del = $$(".grid article")
  .find((a) => a.textContent.includes("Smoke Thermometer"))
  ?.querySelector("button:last-of-type");
check(
  "delete button only on own sensor",
  Boolean(del && del.textContent.includes("Delete")),
);
click(del);
const afterDelete = await until(
  () => !text().includes("Smoke Thermometer"),
  "card removed after delete",
);
check("delete with confirmation", Boolean(afterDelete));
const { status: goneStatus, body: goneBody } = await api(
  "GET",
  `/api/sensors/${sensorId}`,
);
check(
  "sensor deleted on server",
  goneStatus === 404 && (await api("GET", "/api/sensors")).body.items.length === before - 1,
  `${goneStatus} ${JSON.stringify(goneBody)}`,
);

/* sign out */
click(byText("button", "Sign out"));
const signedOut = await until(
  () => Boolean($("#auth-username")),
  "auth forms after sign out",
);
check(
  "sign out clears username",
  Boolean(signedOut) &&
    !window.localStorage.getItem("sensor-dashboard.auth") &&
    !text().includes("smoke_user"),
);

console.log(`${passed}/${passed + failures.length} UI checks passed`);
for (const failure of failures) console.log("FAIL -", failure);
process.exit(failures.length ? 1 : 0);

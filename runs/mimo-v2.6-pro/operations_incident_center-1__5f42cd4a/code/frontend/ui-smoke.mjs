import { readdirSync } from "node:fs";
import { Window } from "happy-dom";

const assets = readdirSync(new URL("./dist/assets/", import.meta.url));
const bundle = assets.find((f) => f.endsWith(".js"));

const window = new Window({ url: "http://127.0.0.1:8000/" });
const { document } = window;
document.body.innerHTML = '<div id="root"></div>';

const setGlobal = (key, value) => {
  try {
    Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
  } catch {
    /* keep node's own */
  }
};
setGlobal("window", window);
setGlobal("document", document);
setGlobal("localStorage", window.localStorage);
setGlobal("location", window.location);
setGlobal("history", window.history);
setGlobal("navigator", window.navigator);
setGlobal("HTMLElement", window.HTMLElement);
setGlobal("HTMLInputElement", window.HTMLInputElement);
setGlobal("HTMLTextAreaElement", window.HTMLTextAreaElement);
setGlobal("HTMLSelectElement", window.HTMLSelectElement);
setGlobal("Element", window.Element);
setGlobal("Node", window.Node);
setGlobal("Event", window.Event);
setGlobal("CustomEvent", window.CustomEvent);
setGlobal("MutationObserver", window.MutationObserver);
setGlobal("getComputedStyle", window.getComputedStyle.bind(window));
setGlobal("requestAnimationFrame", (cb) => setTimeout(cb, 0));
setGlobal("cancelAnimationFrame", (id) => clearTimeout(id));
setGlobal("fetch", window.fetch.bind(window));
setGlobal("Headers", window.Headers);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, cond, extra = "") => {
  results.push([name, !!cond]);
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${cond ? "" : " " + extra}`);
};
const bodyText = () => document.body.textContent || "";

function setValue(el, value) {
  const proto = el instanceof window.HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
  el.dispatchEvent(new window.Event("input", { bubbles: true }));
}

function fireSubmit(form) {
  form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
}

function click(el) {
  el.dispatchEvent(new window.Event("click", { bubbles: true, cancelable: true }));
}

function navigate(path) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new window.Event("popstate"));
}

async function waitFor(predicate, label, timeout = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (predicate(bodyText())) return true;
    await sleep(50);
  }
  console.log(`TIMEOUT waiting for: ${label}`);
  console.log(bodyText().slice(0, 600));
  return false;
}

await import(`./dist/assets/${bundle}`);
await sleep(300);

// 1. public stats page at /
await waitFor((t) => t.includes("Aggregate figures only"), "public stats page");
check("public page renders stats", bodyText().includes("Open incidents") && bodyText().includes("Open past target"));
check("public page shows severity counts", ["sev1", "sev2", "sev3", "sev4"].every((s) => bodyText().includes(s)));
check("public page has no incident details", !bodyText().includes("Cache miss storm"));

// 2. protected list redirects to login when signed out
navigate("/incidents");
const onLogin = await waitFor((t) => t.includes("Sign in to open and update incidents"), "redirect to login");
check("signed-out /incidents redirects to login", onLogin);

// 3. register form + auto sign-in
navigate("/register");
const onRegister = await waitFor((t) => t.includes("Create an account for the operations team"), "register page");
check("register page renders", onRegister);
const regForm = document.querySelector("form");
setValue(document.querySelector("#register-username"), "e2e_user");
setValue(document.querySelector("#register-password"), "e2e_pass");
fireSubmit(regForm);
const signedIn = await waitFor((t) => t.includes("Signed in as e2e_user"), "auto sign-in after register");
check("register + auto sign-in works", signedIn);
const onList = await waitFor((t) => t.includes("Newest incidents first"), "incident list");
check("lands on incident list", onList);

// 4. list shows seeded incidents with breach flag, filters and paging
const hasList = await waitFor((t) => t.includes("Cache miss storm"), "list data");
check("list shows incidents", hasList);
check("list shows breach flag", bodyText().includes("SLA breached"));
check("list has open only switch", !!Array.from(document.querySelectorAll("label")).find((l) => l.textContent.trim() === "Open only"));

const sevSelect = document.querySelector("#filter-severity");
Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set.call(sevSelect, "sev3");
sevSelect.dispatchEvent(new window.Event("change", { bubbles: true }));
await waitFor((t) => t.includes("Cache miss storm") && !t.includes("Login errors"), "severity-filtered list");
check(
  "severity filter narrows list",
  bodyText().includes("Cache miss storm") && !bodyText().includes("Login errors"),
);

Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set.call(sevSelect, "");
sevSelect.dispatchEvent(new window.Event("change", { bubbles: true }));

setValue(document.querySelector("#filter-q"), "Login");
await waitFor((t) => t.includes("Login errors") && !t.includes("Cache miss storm"), "search results");
check("search box filters", bodyText().includes("Login errors") && !bodyText().includes("Cache miss storm"));

// 5. open incident form shows API validation messages
navigate("/incidents/new");
await waitFor((t) => t.includes("The incident starts in status"), "open incident form");
check("open form renders", !!document.querySelector("#incident-title"));
setValue(document.querySelector("#incident-title"), "   ");
setValue(document.querySelector("#incident-service"), "payments");
fireSubmit(document.querySelector("form"));
const validationShown = await waitFor((t) => t.includes("title is required"), "API validation message");
check("open form shows API validation message", validationShown);

// now submit a valid one
setValue(document.querySelector("#incident-title"), "E2E payments outage");
setValue(document.querySelector("#incident-service"), "payments");
fireSubmit(document.querySelector("form"));
const detailShown = await waitFor(
  (t) => t.includes("E2E payments outage") && t.includes("Update status") && t.includes("Timeline"),
  "incident detail page",
);
check("open incident navigates to detail", detailShown);
check("detail shows status buttons", ["investigating", "identified", "monitoring", "resolved"].every((s) => bodyText().includes(s)));
check("detail shows sla target field", bodyText().includes("Resolution target"));

// 6. status change appends timeline event
const resolvedBtn = Array.from(document.querySelectorAll("button")).find((b) => b.textContent.trim() === "resolved");
click(resolvedBtn);
const statusEvent = await waitFor((t) => t.includes("Status changed from investigating to resolved"), "status_change timeline event");
check("status change appends status_change event", statusEvent);
check("resolved_at shown", bodyText().includes("Resolved at"));

// 7. post timeline event
setValue(document.querySelector("#event-message"), "Rollback deployed");
const forms = document.querySelectorAll("form");
fireSubmit(forms[forms.length - 1]);
const eventShown = await waitFor((t) => t.includes("Rollback deployed"), "posted timeline event");
check("posting timeline event works", eventShown);

// 8. sign out
const signOutBtn = Array.from(document.querySelectorAll("button")).find((b) => b.textContent.trim() === "Sign out");
click(signOutBtn);
await sleep(500);
check("sign out clears session header", !bodyText().includes("Signed in as"));

const failed = results.filter(([, ok]) => !ok);
console.log(failed.length === 0 ? "ALL UI CHECKS PASSED" : `UI CHECK FAILURES: ${failed.map(([n]) => n).join(", ")}`);
process.exit(failed.length === 0 ? 0 : 1);

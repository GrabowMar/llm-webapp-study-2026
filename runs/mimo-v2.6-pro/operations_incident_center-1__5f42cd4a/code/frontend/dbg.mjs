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
  } catch {}
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
setGlobal("Headers", window.Headers);

const realFetch = window.fetch.bind(window);
setGlobal("fetch", (input, init) => {
  console.log("FETCH", typeof input === "string" ? input : input.url);
  return realFetch(input, init);
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const bodyText = () => document.body.textContent || "";

function setValue(el, value) {
  const proto = el instanceof window.HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
  el.dispatchEvent(new window.Event("input", { bubbles: true }));
}
function fireSubmit(form) {
  form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
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
  console.log(`TIMEOUT: ${label}`);
  return false;
}

await import(`./dist/assets/${bundle}`);
await sleep(300);

navigate("/register");
await waitFor((t) => t.includes("Create an account for the operations team"), "register");
const regForm = document.querySelector("form");
setValue(document.querySelector("#register-username"), "dbg_user");
setValue(document.querySelector("#register-password"), "dbg_pass");
fireSubmit(regForm);
await waitFor((t) => t.includes("Signed in as dbg_user"), "signin");
await waitFor((t) => t.includes("Newest incidents first"), "list");
await waitFor((t) => t.includes("Cache miss storm"), "data");
console.log("--- initial list ok");

const sevSelect = document.querySelector("#filter-severity");
console.log("select options:", [...sevSelect.options].map((o) => JSON.stringify(o.value)));
Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set.call(sevSelect, "sev3");
sevSelect.dispatchEvent(new window.Event("change", { bubbles: true }));
await sleep(800);
console.log("--- after sev3:", bodyText().includes("Login errors") ? "has Login errors" : "no Login errors", "|", bodyText().includes("Cache miss storm") ? "has Cache miss storm" : "no Cache miss storm");

Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set.call(sevSelect, "");
console.log("select value now:", JSON.stringify(sevSelect.value));
sevSelect.dispatchEvent(new window.Event("change", { bubbles: true }));
await sleep(800);
console.log("--- after clear severity:", bodyText().includes("Login errors") ? "has Login errors" : "no Login errors", "|", bodyText().includes("Cache miss storm") ? "has Cache miss storm" : "no Cache miss storm");

const q = document.querySelector("#filter-q");
console.log("q input found:", !!q);
setValue(q, "Login");
await sleep(1200);
console.log("--- after q=Login:", bodyText().includes("Login errors") ? "has Login errors" : "no Login errors", "|", bodyText().includes("Cache miss storm") ? "has Cache miss storm" : "no Cache miss storm");
process.exit(0);

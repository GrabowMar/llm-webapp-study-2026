/**
 * Headless smoke test of the built frontend.
 *
 * Renders the React app inside jsdom against a running backend and walks the
 * main flows: register, transfer (with confirmation), history and sign out.
 */
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8000";
const bundle = fs.readFileSync(path.join(__dirname, "dist", "app.js"), "utf8");

const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="root"></div></body></html>`, {
  url: `${BASE}/`,
  runScripts: "dangerously",
  pretendToBeVisual: true,
});

const { window } = dom;
const { document } = window;

window.fetch = (input, init) =>
  fetch(typeof input === "string" ? new URL(input, BASE) : input, init);
window.process = { env: { NODE_ENV: "production" } };
window.Headers = globalThis.Headers;
window.Request = globalThis.Request;
window.Response = globalThis.Response;
window.AbortController = globalThis.AbortController;

const errors = [];
window.addEventListener("error", (event) => errors.push(String(event.error || event.message)));
const originalError = window.console.error;
window.console.error = (...args) => {
  errors.push(args.map(String).join(" "));
  originalError(...args);
};

window.eval(bundle);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const text = () => document.body.textContent || "";

function setValue(element, value) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  ).set;
  setter.call(element, value);
  element.dispatchEvent(new window.Event("input", { bubbles: true }));
}

function byLabel(label) {
  const labelNode = [...document.querySelectorAll("label")].find(
    (node) => node.textContent.trim().toLowerCase().startsWith(label.toLowerCase()),
  );
  return labelNode ? document.getElementById(labelNode.htmlFor) : null;
}

function button(text) {
  return [...document.querySelectorAll("button")].find(
    (node) => node.textContent.trim().toLowerCase() === text.toLowerCase(),
  );
}

async function click(node) {
  node.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  await sleep(120);
}

async function submit(node) {
  node.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  await sleep(400);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`ok - ${message}`);
}

(async () => {
  await sleep(300);
  assert(text().includes("Meridian Bank"), "landing page renders the brand");
  assert(text().includes("Sign in"), "sign in tab is visible");

  // Register a fresh account.
  const user = `tester${Date.now()}`;
  await click(button("Create account"));
  setValue(byLabel("Username"), user);
  setValue(byLabel("Password"), "secret123");
  await submit(byLabel("Username").form.querySelector('button[type="submit"]'));

  assert(text().includes("Available balance"), "dashboard is shown after registering");
  assert(text().includes(user), "signed in username is displayed");
  assert(text().includes("$1,000.00"), "balance starts at 1000.00");
  assert(text().includes("Send money"), "transfer form is rendered");

  // Register a recipient and send money to it.
  await click(button("Sign out"));
  assert(text().includes("Create account"), "sign out returns to the auth screen");
  await click(button("Create account"));
  setValue(byLabel("Username"), `${user}_payee`);
  setValue(byLabel("Password"), "secret123");
  await submit(byLabel("Username").form.querySelector('button[type="submit"]'));
  assert(text().includes("$1,000.00"), "recipient account also starts at 1000.00");

  await click(button("Sign out"));
  await click(button("Sign in"));
  setValue(byLabel("Username"), user);
  setValue(byLabel("Password"), "secret123");
  await submit(byLabel("Username").form.querySelector('button[type="submit"]'));
  assert(text().includes("Available balance"), "sign in works");

  // Transfer flow with confirmation step.
  setValue(byLabel("Recipient username"), `${user}_payee`);
  setValue(byLabel("Amount"), "125.50");
  setValue(byLabel("Memo"), "dinner");
  await submit(byLabel("Recipient username").form.querySelector('button[type="submit"]'));
  assert(text().includes("Confirm this transfer"), "confirmation step is shown");
  assert(text().includes("$125.50"), "confirmation shows the amount");
  assert(text().includes("$874.50"), "confirmation shows the resulting balance");

  await click(button("Confirm & send"));
  assert(text().includes("Sent $125.50"), "success message from the API is shown");
  assert(text().includes("$874.50"), "balance is updated after the transfer");
  assert(text().includes(`${user}_payee`), "history shows the counterparty");
  assert(text().includes("dinner"), "history shows the memo");
  assert(text().includes("Sent"), "history shows the direction");

  // Insufficient balance message comes from the API.
  setValue(byLabel("Recipient username"), `${user}_payee`);
  setValue(byLabel("Amount"), "5000");
  await submit(byLabel("Recipient username").form.querySelector('button[type="submit"]'));
  await click(button("Confirm & send"));
  assert(
    text().toLowerCase().includes("insufficient"),
    "insufficient balance message is displayed",
  );

  // Paging controls exist.
  assert(text().includes("Page 1 of"), "history shows paging information");
  await click(button("Next"));

  if (errors.length > 0) {
    throw new Error(`console errors:\n${errors.join("\n")}`);
  }
  console.log("\nAll frontend smoke checks passed.");
})().catch((error) => {
  console.error(`FAILED: ${error.message}`);
  process.exit(1);
});

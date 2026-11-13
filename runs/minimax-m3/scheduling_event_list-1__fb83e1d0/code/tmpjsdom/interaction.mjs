/** End-to-end interaction test of the built frontend against the live API. */
import fs from "node:fs";
import path from "node:path";
import { JSDOM } from "jsdom";

const distDir = path.resolve("../frontend/dist");
const html = fs.readFileSync(path.join(distDir, "index.html"), "utf-8");
const asset = fs
  .readdirSync(path.join(distDir, "assets"))
  .find((name) => name.endsWith(".js"));

const dom = new JSDOM(html, { url: "http://localhost:8000/", pretendToBeVisual: true });
global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(global, "navigator", { value: dom.window.navigator, configurable: true });
global.HTMLElement = dom.window.HTMLElement;
global.Element = dom.window.Element;
global.Node = dom.window.Node;
global.Event = dom.window.Event;
global.MouseEvent = dom.window.MouseEvent;
global.KeyboardEvent = dom.window.KeyboardEvent;
global.getComputedStyle = dom.window.getComputedStyle;
global.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
global.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
global.MessageChannel = dom.window.MessageChannel;
global.MutationObserver = dom.window.MutationObserver;
global.CustomEvent = dom.window.CustomEvent;
global.DOMException = dom.window.DOMException;
global.localStorage = dom.window.localStorage;
const nodeFetch = globalThis.fetch;
global.fetch = (input, init) => {
  const url = new URL(typeof input === "string" ? input : input.url, "http://localhost:8000");
  return nodeFetch(`http://127.0.0.1:8000${url.pathname}${url.search}`, init);
};

const errors = [];
const originalError = console.error;
console.error = (...args) => {
  errors.push(args.map(String).join(" "));
  originalError(...args);
};
dom.window.addEventListener("error", (event) => errors.push(String(event.error || event.message)));

const doc = dom.window.document;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const results = [];
const check = (label, condition) => {
  results.push([label, Boolean(condition)]);
  console.log(`${condition ? "PASS" : "FAIL"} - ${label}`);
};

function byText(selector, text) {
  return [...doc.querySelectorAll(selector)].find((node) =>
    node.textContent.trim() === text,
  );
}

function click(node) {
  node.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
}

function setValue(input, value) {
  const prototype = Object.getPrototypeOf(input);
  const setter = Object.getOwnPropertyDescriptor(prototype, "value").set;
  setter.call(input, value);
  input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
}

await import(path.join(distDir, "assets", asset));
await sleep(800);

// --- register ---------------------------------------------------------------
click(byText("button", "Register"));
await sleep(100);
const USER = `tester${Date.now().toString().slice(-6)}`;
setValue(doc.querySelector('input[name="register-username"]'), USER);
setValue(doc.querySelector('input[name="register-password"]'), "secret123");
click(byText("button", "Create account"));
await sleep(800);
check("signed in after registration", doc.body.textContent.includes(`Signed in as ${USER}`));

// --- create -----------------------------------------------------------------
click(byText("button", "+ New event"));
await sleep(200);
const titleInput = doc.querySelector('input[name="title"]');
check("event form opened", Boolean(titleInput));
setValue(titleInput, "Design review");
setValue(doc.querySelector('input[name="start_time"]'), "2026-11-12T14:00");
setValue(doc.querySelector('input[name="end_time"]'), "2026-11-12T15:30");
setValue(doc.querySelector('input[name="location"]'), "Room 5");
click(byText("button", "Create event"));
await sleep(800);
check("event created", doc.body.textContent.includes("Design review"));

// --- validation errors from the API -----------------------------------------
click(byText("button", "+ New event"));
await sleep(200);
setValue(doc.querySelector('input[name="title"]'), "");
setValue(doc.querySelector('input[name="start_time"]'), "2026-11-12T16:00");
setValue(doc.querySelector('input[name="end_time"]'), "2026-11-12T15:00");
click(byText("button", "Create event"));
await sleep(600);
const bodyText = doc.body.textContent;
check("api validation message shown", bodyText.includes("Title is required."));
check("api end time message shown", bodyText.includes("End time must not be earlier"));
click(byText("button", "Cancel"));
await sleep(200);

// --- details + edit ---------------------------------------------------------
const eventChip = [...doc.querySelectorAll("button")].find((node) =>
  node.textContent.includes("Design review"),
);
click(eventChip);
await sleep(300);
check("details modal opened", doc.body.textContent.includes("Event details"));
check("details show creator", doc.body.textContent.includes(USER));
click(byText("button", "Edit"));
await sleep(300);
setValue(doc.querySelector('input[name="title"]'), "Design review v2");
click(byText("button", "Save changes"));
await sleep(800);
check("event updated", doc.body.textContent.includes("Design review v2"));

// --- delete with confirmation -----------------------------------------------
const updatedChip = [...doc.querySelectorAll("button")].find((node) =>
  node.textContent.includes("Design review v2"),
);
click(updatedChip);
await sleep(300);
click(byText("button", "Delete"));
await sleep(300);
check("confirmation dialog shown", doc.body.textContent.includes("Are you sure you want to delete"));
click(byText("button", "Delete event"));
await sleep(800);
const chipAfterDelete = [...doc.querySelectorAll("button")].some((node) =>
  node.textContent.includes("Design review v2"),
);
check("event deleted", !chipAfterDelete);

// --- views and navigation ---------------------------------------------------
const monthTitle = doc.querySelector("h2").textContent;
click(byText("button", "Week"));
await sleep(500);
check("week view rendered", doc.body.textContent.includes("Mon") && doc.body.textContent.includes("Sun"));
check("week view has hour labels", doc.body.textContent.includes("00:00"));
click(byText("button", "Day"));
await sleep(500);
check("day view rendered", doc.body.textContent.includes("in this period"));
click(byText("button", "Month"));
await sleep(500);
check("month view restored", doc.querySelector("h2").textContent === monthTitle);

const titleBefore = doc.querySelector("h2").textContent;
click(doc.querySelector('button[aria-label="Next period"]'));
await sleep(500);
check("next period changes title", doc.querySelector("h2").textContent !== titleBefore);
click(doc.querySelector('button[aria-label="Previous period"]'));
await sleep(500);
check("previous period restores title", doc.querySelector("h2").textContent === titleBefore);
click(byText("button", "Today"));
await sleep(500);
check("today button works", doc.body.textContent.includes("in this period"));

// --- sign out ---------------------------------------------------------------
click(byText("button", "Sign out"));
await sleep(300);
check("signed out", doc.body.textContent.includes("Sign in") && !doc.body.textContent.includes("Signed in as"));

console.log("--- errors ---");
console.log(errors.length ? errors.join("\n") : "none");
const failed = results.filter(([, ok]) => !ok).length;
console.log(`${results.length - failed}/${results.length} checks passed`);
process.exit(failed || errors.length ? 1 : 0);

/**
 * Renders the production bundle in jsdom against the local API to catch
 * runtime errors in the React app.
 */
import fs from "node:fs";
import path from "node:path";
import { JSDOM } from "jsdom";

const distDir = path.resolve("../frontend/dist");
const html = fs.readFileSync(path.join(distDir, "index.html"), "utf-8");
const asset = fs
  .readdirSync(path.join(distDir, "assets"))
  .find((name) => name.endsWith(".js"));

const dom = new JSDOM(html, {
  url: "http://localhost:8000/",
  pretendToBeVisual: true,
});

global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(global, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});
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
global.IntersectionObserver = dom.window.IntersectionObserver ?? class {};
global.ResizeObserver = dom.window.ResizeObserver ?? class {};
global.localStorage = dom.window.localStorage;
const nodeFetch = globalThis.fetch;
global.fetch = (input, init) => {
  const url = new URL(typeof input === "string" ? input : input.url, "http://localhost:8000");
  return nodeFetch(`http://127.0.0.1:8000${url.pathname}${url.search}`, init);
};

const errors = [];
dom.window.addEventListener("error", (event) => errors.push(String(event.error || event.message)));
const originalError = console.error;
console.error = (...args) => {
  errors.push(args.map(String).join(" "));
  originalError(...args);
};

await import(path.join(distDir, "assets", asset));

await new Promise((resolve) => setTimeout(resolve, 1500));

const text = dom.window.document.body.textContent.replace(/\s+/g, " ").trim();
console.log("--- rendered text ---");
console.log(text.slice(0, 2000));
console.log("--- errors ---");
console.log(errors.length ? errors.join("\n") : "none");

const checks = {
  title: text.includes("Event Calendar"),
  auth: text.includes("Sign in"),
  register: text.includes("Register"),
  monthTab: text.includes("Month") && text.includes("Week") && text.includes("Day"),
  today: text.includes("Today"),
  monthGrid: dom.window.document.querySelectorAll('[aria-label^="Show "]').length === 42,
};
console.log("--- checks ---");
console.log(checks);
process.exit(errors.length || Object.values(checks).some((value) => !value) ? 1 : 0);

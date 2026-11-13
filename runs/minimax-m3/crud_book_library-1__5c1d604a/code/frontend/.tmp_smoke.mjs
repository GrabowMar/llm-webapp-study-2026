import { JSDOM } from "jsdom";
import { pathToFileURL } from "node:url";
import fs from "node:fs";

const BASE = "http://127.0.0.1:8000";
const distDir = "/workspace/frontend/dist";
const asset = fs.readdirSync(`${distDir}/assets`).find((f) => f.endsWith(".js"));

const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="root"></div></body></html>`, {
  url: "http://localhost/",
  pretendToBeVisual: true,
});

const w = dom.window;
w.scrollTo = () => {};
w.confirm = () => true;
w.alert = () => {};

globalThis.window = w;
globalThis.document = w.document;
globalThis.navigator = w.navigator;
globalThis.localStorage = w.localStorage;
globalThis.HTMLElement = w.HTMLElement;
globalThis.Node = w.Node;
globalThis.Event = w.Event;
globalThis.MouseEvent = w.MouseEvent;
globalThis.KeyboardEvent = w.KeyboardEvent;
globalThis.getComputedStyle = w.getComputedStyle.bind(w);
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);

const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = typeof input === "string" ? new URL(input, BASE).toString() : input;
  return realFetch(url, init);
};
w.fetch = globalThis.fetch;

const tick = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms));
const text = () => w.document.body.textContent ?? "";
const byText = (selector, needle) =>
  [...w.document.querySelectorAll(selector)].find((el) => (el.textContent ?? "").includes(needle));

async function main() {
  await import(pathToFileURL(`${distDir}/assets/${asset}`).href);
  await tick(400);

  const failures = [];
  const check = (name, cond, extra = "") => {
    if (cond) console.log(`PASS ${name}`);
    else {
      console.log(`FAIL ${name} ${extra}`);
      failures.push(name);
    }
  };

  check("header renders", text().includes("Book Library"), text().slice(0, 200));
  check("books heading", text().includes("Browse the shared catalogue"));
  check("sign in button", Boolean(byText("button", "Sign in / Register")));
  check("search box", Boolean(w.document.querySelector("#search")));
  check("table headers", text().includes("Average rating") && text().includes("Author"));

  const signInButton = byText("button", "Sign in / Register");
  signInButton.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await tick(100);
  check("login form visible", Boolean(w.document.querySelector("#username")) && Boolean(w.document.querySelector("#password")));

  const username = "smoke" + Date.now();
  const password = "secret123";
  w.document.querySelector("#username").value = username;
  w.document.querySelector("#username").dispatchEvent(new w.Event("input", { bubbles: true }));
  w.document.querySelector("#password").value = password;
  w.document.querySelector("#password").dispatchEvent(new w.Event("input", { bubbles: true }));
  await tick(50);
  w.document.querySelector("form").dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
  await tick(600);
  check("signed in", text().includes("Signed in as"), text().slice(0, 300));
  check("username shown", text().includes(username));

  const addLink = byText("a", "Add book");
  check("add link", Boolean(addLink));
  addLink.dispatchEvent(new w.MouseEvent("click", { bubbles: true, button: 0 }));
  await tick(300);
  check("add form", Boolean(w.document.querySelector("#title")) && Boolean(w.document.querySelector("#author")));
  check("url changed", w.location.pathname === "/books/new", w.location.pathname);

  const setValue = (id, value) => {
    const el = w.document.querySelector(id);
    el.value = value;
    el.dispatchEvent(new w.Event("input", { bubbles: true }));
  };
  setValue("#title", "The Dispossessed");
  setValue("#author", "Ursula K. Le Guin");
  setValue("#year", "1974");
  setValue("#isbn", "9780060512750");
  await tick(50);
  const forms = [...w.document.querySelectorAll("form")];
  const bookForm = forms.find((f) => f.querySelector("#title"));
  bookForm.dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
  await tick(700);
  check("navigated to book page", /^\/books\/\d+$/.test(w.location.pathname), w.location.pathname);
  check("book title shown", text().includes("The Dispossessed"), text().slice(0, 400));
  check("reviews heading", text().includes("Reviews"));
  check("rating form", Boolean(w.document.querySelector("#rating")) && Boolean(w.document.querySelector("#comment")));

  w.document.querySelector("#rating").value = "4";
  w.document.querySelector("#rating").dispatchEvent(new w.Event("change", { bubbles: true }));
  setValue("#comment", "A thoughtful read.");
  await tick(50);
  const reviewForm = [...w.document.querySelectorAll("form")].find((f) => f.querySelector("#rating"));
  reviewForm.dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
  await tick(700);
  check("review posted", text().includes("A thoughtful read."), text().slice(0, 500));
  check("review count", text().includes("1 review"), text().slice(0, 300));

  const del = byText("button", "Delete");
  check("delete button", Boolean(del));
  del.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await tick(700);
  check("back at list", w.location.pathname === "/", w.location.pathname);

  const search = w.document.querySelector("#search");
  search.value = "zzzznotfound";
  search.dispatchEvent(new w.Event("input", { bubbles: true }));
  await tick(700);
  check("search empty state", text().includes("No books match"), text().slice(0, 300));

  console.log();
  console.log("FAILURES:", failures.length ? failures : "none");
  process.exit(failures.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

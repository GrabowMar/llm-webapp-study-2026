import fs from "node:fs";
import path from "node:path";
import { JSDOM } from "jsdom";

const BASE = "http://127.0.0.1:8000";
const BUNDLE = fs
  .readdirSync("/workspace/frontend/dist/assets")
  .filter((f) => f.endsWith(".js"))
  .map((f) => path.join("/workspace/frontend/dist/assets", f))[0];

const realFetch = globalThis.fetch.bind(globalThis);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, desc, timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    let v;
    try {
      v = fn();
    } catch {
      /* keep polling */
    }
    if (v) return v;
    await sleep(50);
  }
  throw new Error(`timeout waiting for: ${desc}`);
}

function installGlobals(dom) {
  for (const key of Reflect.ownKeys(dom.window)) {
    if (key in globalThis) continue;
    try {
      globalThis[key] = dom.window[key];
    } catch {
      /* ignore read-only */
    }
  }
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.localStorage = dom.window.localStorage;
  globalThis.fetch = (input, init) =>
    realFetch(
      typeof input === "string" && input.startsWith("/") ? BASE + input : input,
      init,
    );
}

function setValue(el, value) {
  const proto =
    el.tagName === "TEXTAREA"
      ? el.ownerDocument.defaultView.HTMLTextAreaElement.prototype
      : el.ownerDocument.defaultView.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
  el.dispatchEvent(
    new el.ownerDocument.defaultView.Event("input", { bubbles: true }),
  );
}

function click(el) {
  el.dispatchEvent(
    new el.ownerDocument.defaultView.MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    }),
  );
}

function submitForm(form) {
  form.dispatchEvent(
    new form.ownerDocument.defaultView.Event("submit", {
      bubbles: true,
      cancelable: true,
    }),
  );
}

function buttonByText(document, text) {
  return [...document.querySelectorAll("button")].find(
    (b) => b.textContent.trim() === text,
  );
}

function assert(cond, msg) {
  if (!cond) throw new Error("ASSERT FAILED: " + msg);
  console.log("  ok - " + msg);
}

async function freshDom(pathname) {
  const html = await (await realFetch(BASE + pathname)).text();
  const dom = new JSDOM(html, { url: BASE + pathname, pretendToBeVisual: true });
  installGlobals(dom);
  return dom;
}

async function scenarioFull() {
  const user = "e2e_" + Date.now();
  const pass = "hunter2!";
  await freshDom("/");
  await import(BUNDLE);

  const doc = globalThis.document;
  await waitFor(() => buttonByText(doc, "Create account"), "auth page");

  // --- register through the UI
  click(buttonByText(doc, "Create account")); // switch to register tab
  await waitFor(
    () => buttonByText(doc, "Create account") && doc.getElementById("username"),
    "register form",
  );
  setValue(doc.getElementById("username"), user);
  setValue(doc.getElementById("password"), pass);
  submitForm(doc.querySelector("form"));
  await waitFor(
    () => doc.body.textContent.includes("Signed in as " + user),
    "signed in after register",
  );
  assert(true, "UI registration signs the user in");
  assert(doc.body.textContent.includes("+ New note"), "notes sidebar shown");

  // --- create a note through the UI
  click(buttonByText(doc, "+ New note"));
  await waitFor(() => doc.getElementById("note-body"), "editor opens");
  assert(true, "editor opens for a new note");

  setValue(doc.querySelector('input[aria-label="Note title"]'), "Smoke note");
  setValue(
    doc.getElementById("note-body"),
    "# Hello Smoke\n\n**bold** text and [a link](https://example.com)",
  );

  // --- live preview is rendered by the API
  await waitFor(
    () => {
      const p = doc.querySelector("div.prose");
      return p && p.innerHTML.includes("<h1>Hello Smoke</h1>");
    },
    "preview shows API-rendered heading",
  );
  const preview = doc.querySelector("div.prose").innerHTML;
  assert(preview.includes("<h1>Hello Smoke</h1>"), "preview has rendered h1");
  assert(preview.includes("<strong>bold</strong>"), "preview has rendered strong");
  assert(preview.includes('href="https://example.com"'), "preview has rendered link");
  assert(doc.body.textContent.includes("All changes saved"), "autosave settles");

  // --- publish: switch + copyable public link
  click(doc.querySelector('button[role="switch"]'));
  const linkInput = await waitFor(
    () => doc.querySelector('input[aria-label="Public link"]'),
    "public link appears",
  );
  assert(
    /\/p\/\d+$/.test(linkInput.value),
    "public link shown: " + linkInput.value,
  );
  const noteId = Number(linkInput.value.split("/").pop());
  await waitFor(
    () => doc.body.textContent.includes("Published"),
    "published badge visible",
  );
  assert(true, "published state reflected in the UI");

  // --- sign out, then sign back in through the login form
  click(buttonByText(doc, "Sign out"));
  await waitFor(() => doc.getElementById("username"), "auth page after sign out");
  assert(true, "sign out returns to the auth page");
  setValue(doc.getElementById("username"), user);
  setValue(doc.getElementById("password"), pass);
  submitForm(doc.querySelector("form"));
  await waitFor(
    () => doc.body.textContent.includes("Signed in as " + user),
    "signed in after login",
  );
  await waitFor(
    () => doc.body.textContent.includes("Smoke note"),
    "note list shows the note",
  );
  assert(true, "UI login works and lists the note");

  console.log("NOTE_ID=" + noteId);
  console.log("USER=" + user);
  console.log("FULL-SCENARIO-PASS");
}

async function scenarioPublic(noteId) {
  await freshDom("/p/" + noteId);
  await import(BUNDLE);
  const doc = globalThis.document;
  await waitFor(
    () => doc.querySelector("h1") && doc.querySelector("h1").textContent.length > 0,
    "public page renders",
  );
  assert(
    doc.querySelector("h1").textContent === "Smoke note",
    "public page shows the title",
  );
  assert(doc.body.textContent.includes("e2e_"), "public page shows the author");
  const article = doc.querySelector("div.prose");
  assert(
    article && article.innerHTML.includes("<h1>Hello Smoke</h1>"),
    "public page shows the rendered HTML",
  );

  // raw API checks for the public endpoints
  const meta = await (await realFetch(BASE + "/api/public/notes/" + noteId)).json();
  assert(meta.author && meta.title === "Smoke note", "public JSON has author+title");
  const html = await (
    await realFetch(BASE + "/api/public/notes/" + noteId + "/html")
  ).text();
  assert(html.includes("<h1>Hello Smoke</h1>"), "public HTML endpoint renders");
  const asAuthor = await realFetch(BASE + "/api/public/notes/999999/html");
  assert(asAuthor.status === 404, "missing note is 404 for the public endpoint");
  console.log("PUBLIC-SCENARIO-PASS");
}

const mode = process.argv[2];
try {
  if (mode === "full") await scenarioFull();
  else if (mode === "public") await scenarioPublic(Number(process.argv[3]));
  else throw new Error("usage: smoke.mjs full|public <id>");
} catch (err) {
  console.error(String(err && err.message ? err.message : err));
  process.exit(1);
}
process.exit(0);

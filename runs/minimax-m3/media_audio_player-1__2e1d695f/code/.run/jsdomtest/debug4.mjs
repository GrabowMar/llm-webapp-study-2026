import fs from "node:fs";
import path from "node:path";
import { JSDOM, VirtualConsole } from "jsdom";

const DIST = "/workspace/frontend/dist";
const html = fs.readFileSync(path.join(DIST, "index.html"), "utf8");
const virtualConsole = new VirtualConsole();
virtualConsole.on("jsdomError", (e) => console.log("JSDOM ERROR:", e.message));
const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true, url: "http://localhost:8000/", virtualConsole });
const { window } = dom;
window.fetch = async (url) => { console.log("FETCH", url); return { ok: true, status: 200, text: async () => JSON.stringify({ items: [], total: 0, page: 1, page_size: 10 }) }; };
window.localStorage.setItem("audio-library.token", "tok");
for (const file of fs.readdirSync(path.join(DIST, "assets")).filter((f) => f.endsWith(".js"))) {
  window.eval(fs.readFileSync(path.join(DIST, "assets", file), "utf8"));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(200);
const doc = window.document;
const root = doc.getElementById("root");
root.addEventListener("submit", (e) => console.log("submit reached root, target:", e.target.tagName));
doc.addEventListener("submit", () => console.log("submit reached document"));
const form = doc.querySelector("form");
console.log("form:", !!form);
form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
await sleep(300);
// also try requestSubmit
console.log("--- try requestSubmit ---");
form.requestSubmit();
await sleep(300);

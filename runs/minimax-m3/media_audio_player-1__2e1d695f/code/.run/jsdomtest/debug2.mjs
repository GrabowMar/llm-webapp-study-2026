import fs from "node:fs";
import path from "node:path";
import { JSDOM, VirtualConsole } from "jsdom";

const DIST = "/workspace/frontend/dist";
const html = fs.readFileSync(path.join(DIST, "index.html"), "utf8");
const virtualConsole = new VirtualConsole();
virtualConsole.on("jsdomError", (e) => console.log("JSDOM ERROR:", e.message));
virtualConsole.on("error", (...args) => console.log("console.error:", ...args));
const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true, url: "http://localhost:8000/", virtualConsole });
const { window } = dom;
window.fetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ items: [], total: 0, page: 1, page_size: 10 }) });
window.localStorage.setItem("audio-library.token", "tok");
for (const file of fs.readdirSync(path.join(DIST, "assets")).filter((f) => f.endsWith(".js"))) {
  window.eval(fs.readFileSync(path.join(DIST, "assets", file), "utf8"));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(200);
const doc = window.document;
// click the "Sign out" button -> header should switch to guest
const signOut = [...doc.querySelectorAll("button")].find((b) => b.textContent.includes("Sign out"));
console.log("signout button:", !!signOut);
signOut.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
await sleep(200);
console.log("after click:", doc.body.textContent.replace(/\s+/g, " ").slice(0, 120));
// click the tab "Create account"
const tab = [...doc.querySelectorAll("button")].find((b) => b.textContent.trim() === "Create account");
console.log("tab:", !!tab);
if (tab) {
  tab.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  await sleep(200);
  console.log("after tab click:", doc.body.textContent.replace(/\s+/g, " ").slice(0, 200));
}

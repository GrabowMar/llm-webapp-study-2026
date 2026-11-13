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

const calls = [];
const state = { token: "tok-login", user: { id: 2, username: "signedin_user" }, tracks: [] };

const jsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => JSON.stringify(body),
});

window.fetch = async (url, options = {}) => {
  const method = (options.method || "GET").toUpperCase();
  const body = options.body ? JSON.parse(options.body) : null;
  calls.push({ url, method, body });

  if (url === "/api/auth/me") {
    if (!state.token) return jsonResponse(401, { error: "Authentication required" });
    return jsonResponse(200, state.user);
  }
  if (url === "/api/tracks" && method === "POST") {
    if (!body.url || !/^https?:\/\//.test(body.url)) {
      return jsonResponse(400, {
        error: "Only http and https URLs are allowed",
        errors: { url: "Only http and https URLs are allowed" },
      });
    }
    if (!body.title || !body.title.trim()) {
      return jsonResponse(400, { error: "Title is required", errors: { title: "Title is required" } });
    }
    const track = {
      id: state.tracks.length + 1,
      title: body.title,
      artist: body.artist,
      url: body.url,
      duration: body.duration || null,
      play_count: 0,
      created_at: new Date().toISOString(),
      added_by: state.user.username,
    };
    state.tracks.unshift(track);
    return jsonResponse(201, track);
  }
  if (url.endsWith("/plays") && method === "POST") {
    const id = Number(url.split("/").at(-2));
    const track = state.tracks.find((t) => t.id === id);
    if (!track) return jsonResponse(404, { error: "Track not found" });
    track.play_count += 1;
    return jsonResponse(200, track);
  }
  if (url.match(/^\/api\/tracks\/\d+$/) && method === "DELETE") {
    const id = Number(url.split("/").at(-1));
    const index = state.tracks.findIndex((t) => t.id === id);
    if (index === -1) return jsonResponse(404, { error: "Track not found" });
    state.tracks.splice(index, 1);
    return jsonResponse(200, { ok: true, id });
  }
  return jsonResponse(404, { error: "Not found" });
};

window.localStorage.setItem("audio-library.token", "tok-login");

// jsdom has no media stack: stub the Audio element so playback does not explode.
class FakeAudio {
  constructor() {
    this.paused = true;
    this.currentTime = 0;
    this.duration = NaN;
    this.volume = 1;
    this.src = "";
    this.listeners = {};
  }
  addEventListener(type, fn) {
    (this.listeners[type] ||= []).push(fn);
  }
  removeEventListener(type, fn) {
    this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn);
  }
  dispatch(type) {
    (this.listeners[type] || []).forEach((fn) => fn());
  }
  play() {
    this.paused = false;
    this.dispatch("play");
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
    this.dispatch("pause");
  }
  load() {}
}
window.Audio = FakeAudio;

for (const file of fs.readdirSync(path.join(DIST, "assets")).filter((f) => f.endsWith(".js"))) {
  window.eval(fs.readFileSync(path.join(DIST, "assets", file), "utf8"));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const doc = window.document;
const text = () => doc.body.textContent;
const byText = (selector, needle) => [...doc.querySelectorAll(selector)].find((el) => el.textContent.trim().includes(needle));
const results = [];
const check = (name, condition) => {
  results.push({ name, ok: Boolean(condition) });
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}`);
};

function setInput(el, value) {
  const proto = Object.getPrototypeOf(el);
  const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
  setter.call(el, value);
  el.dispatchEvent(new window.Event("input", { bubbles: true }));
}

function submitForm(form) {
  form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
}

function click(el) {
  el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
}

await sleep(200);

// --- add a track with an invalid url: the API message must be shown
setInput(doc.querySelector("#track-title"), "Invalid URL track");
setInput(doc.querySelector("#track-url"), "ftp://example.com/x.mp3");
submitInputForm(doc.querySelector("#track-title").form);
await sleep(200);
check("shows API validation message", text().includes("Only http and https URLs are allowed"));

// --- add a valid track
setInput(doc.querySelector("#track-title"), "Sunrise");
setInput(doc.querySelector("#track-artist"), "The Dawn");
setInput(doc.querySelector("#track-url"), "https://cdn.example.com/1.mp3");
setInput(doc.querySelector("#track-duration"), "3:35");
submitInputForm(doc.querySelector("#track-title").form);
await sleep(250);
check("track appears in the list", text().includes("Sunrise"));
check("artist appears in the list", text().includes("The Dawn"));
check("duration is formatted", text().includes("3:35"));
check("form was cleared", doc.querySelector("#track-title").value === "");

// --- play the track: play count must increase through the API
const playButton = byText("button", "Play") || doc.querySelector('button[aria-label^="Play"]');
click(doc.querySelector('button[aria-label^="Play "]'));
await sleep(250);
check("play endpoint called", calls.some((c) => c.url.endsWith("/plays") && c.method === "POST"));
check("play count updated in the list", text().includes("1"));

// --- delete needs a confirmation
const deleteButton = doc.querySelector('button[aria-label^="Delete"]');
check("owner sees a delete button", !!deleteButton);
click(deleteButton);
await sleep(100);
check("confirmation dialog shown", !!doc.querySelector('[role="dialog"]'));
const cancel = byText("button", "Cancel");
click(cancel);
await sleep(100);
check("cancel keeps the track", !!doc.querySelector('button[aria-label^="Delete"]'));

click(doc.querySelector('button[aria-label^="Delete"]'));
await sleep(100);
click(byText('[role="dialog"] button', "Delete"));
await sleep(250);
check("delete endpoint called", calls.some((c) => c.method === "DELETE"));
check("track removed from list", !text().includes("Sunrise"));

// --- search
setInput(doc.querySelector('input[aria-label="Search tracks"]'), "nothing");
await sleep(400);
check("search filters the list", text().includes("No tracks"));
setInput(doc.querySelector('input[aria-label="Search tracks"]'), "");
await sleep(400);

console.log("");
const failed = results.filter((r) => !r.ok);
if (failed.length) {
  console.log("FAILURES:", failed.map((f) => f.name).join(", "));
  process.exit(1);
}
console.log("interaction checks passed");

function submitInputForm(form) {
  form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
}

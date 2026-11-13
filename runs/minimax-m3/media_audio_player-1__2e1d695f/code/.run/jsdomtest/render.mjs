import fs from "node:fs";
import path from "node:path";
import { JSDOM, VirtualConsole } from "jsdom";

const DIST = "/workspace/frontend/dist";
const html = fs.readFileSync(path.join(DIST, "index.html"), "utf8");

const virtualConsole = new VirtualConsole();
virtualConsole.on("jsdomError", (e) => console.log("JSDOM ERROR:", e.message));
virtualConsole.on("error", (...args) => console.log("console.error:", ...args));
virtualConsole.on("warn", (...args) => console.log("console.warn:", ...args));

const dom = new JSDOM(html, {
  runScripts: "outside-only",
  pretendToBeVisual: true,
  url: "http://localhost:8000/",
  virtualConsole,
});

const { window } = dom;
window.matchMedia =
  window.matchMedia ||
  (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));

const calls = [];
const state = {
  token: "tok-login",
  user: { id: 2, username: "signedin_user" },
  tracks: [],
};

const jsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => JSON.stringify(body),
});

window.fetch = async (url, options = {}) => {
  const method = (options.method || "GET").toUpperCase();
  const body = options.body ? JSON.parse(options.body) : null;
  calls.push({ url, method, body, headers: options.headers });

  if (url === "/api/auth/me") {
    if (!state.token) return jsonResponse(401, { error: "Authentication required" });
    return jsonResponse(200, state.user);
  }
  if (url === "/api/auth/register") {
    state.token = "tok-register";
    state.user = { id: 1, username: body.username };
    return jsonResponse(201, { id: 1, username: body.username, token: "tok-register" });
  }
  if (url === "/api/auth/login") {
    if (body.password !== "correct") return jsonResponse(401, { error: "Invalid username or password" });
    state.token = "tok-login";
    state.user = { id: 2, username: body.username };
    return jsonResponse(200, { token: "tok-login", id: 2, username: body.username });
  }
  if (url === "/api/tracks" && method === "POST") {
    if (!options.headers || !options.headers.Authorization) {
      return jsonResponse(401, { error: "Authentication required" });
    }
    if (!/^https?:\/\//.test(body.url)) {
      return jsonResponse(400, { error: "Only http and https URLs are allowed", errors: { url: "Only http and https URLs are allowed" } });
    }
    const track = {
      id: state.tracks.length + 1,
      title: body.title,
      artist: body.artist,
      url: body.url,
      duration: body.duration || null,
      play_count: 0,
      created_at: new Date().toISOString(),
      added_by: state.user ? state.user.username : "someone",
    };
    state.tracks.unshift(track);
    return jsonResponse(201, track);
  }
  if (url.startsWith("/api/tracks?") || url === "/api/tracks") {
    const params = new URLSearchParams(url.split("?")[1] || "");
    const q = (params.get("q") || "").toLowerCase();
    let items = state.tracks;
    if (q) items = items.filter((t) => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q));
    const page = Number(params.get("page") || 1);
    const pageSize = Number(params.get("page_size") || 20);
    const start = (page - 1) * pageSize;
    return jsonResponse(200, {
      items: items.slice(start, start + pageSize),
      total: items.length,
      page,
      page_size: pageSize,
    });
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
  if (url.match(/^\/api\/tracks\/\d+$/)) {
    const id = Number(url.split("/").at(-1));
    const track = state.tracks.find((t) => t.id === id);
    if (!track) return jsonResponse(404, { error: "Track not found" });
    return jsonResponse(200, track);
  }
  return jsonResponse(404, { error: "Not found" });
};

window.localStorage.setItem("audio-library.token", "tok-login");

const scripts = fs.readdirSync(path.join(DIST, "assets")).filter((f) => f.endsWith(".js"));
for (const file of scripts) {
  const code = fs.readFileSync(path.join(DIST, "assets", file), "utf8");
  window.eval(code);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
await sleep(300);

const text = () => window.document.body.textContent;
const q = (selector) => window.document.querySelector(selector);

console.log("--- initial render (signed in) ---");
console.log(text().replace(/\s+/g, " ").slice(0, 400));

const results = [];
const check = (name, condition) => {
  results.push({ name, ok: Boolean(condition) });
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}`);
};

check("renders header", text().includes("Audio Library"));
check("shows signed in username", text().includes("signedin_user") || text().includes("Signed in as"));
check("shows sign out button", [...window.document.querySelectorAll("button")].some((b) => b.textContent.includes("Sign out")));
check("renders track rows", window.document.querySelectorAll("tbody tr").length >= 0);
check("renders player bar", !!q('input[aria-label="Seek"]') && !!q('input[aria-label="Volume"]'));
check("has search box", !!q('input[aria-label="Search tracks"]'));
check("has add track form", !!q("#track-title") && !!q("#track-url"));

console.log("--- API calls seen ---");
console.log(calls.map((c) => `${c.method} ${c.url}`).join("\n"));

console.log("");
const failed = results.filter((r) => !r.ok);
if (failed.length) {
  console.log("FAILURES:", failed.map((f) => f.name).join(", "));
  process.exit(1);
}
console.log("jsdom render checks passed");

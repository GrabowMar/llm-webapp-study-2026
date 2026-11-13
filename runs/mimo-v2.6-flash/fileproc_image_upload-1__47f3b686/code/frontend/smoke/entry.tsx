import { renderToString } from "react-dom/server";
import App from "../src/App";

function expect(html: string, needles: string[], label: string) {
  for (const needle of needles) {
    if (!html.includes(needle)) {
      throw new Error(`${label}: missing "${needle}"`);
    }
  }
  console.log(`SMOKE ${label} OK (${html.length} chars)`);
}

// signed-out render
expect(
  renderToString(<App />),
  ["Image Gallery", "Create account", "Sign in", "Loading images...", "Browsing as guest"],
  "signed-out",
);

// signed-in render
const store = new Map<string, string>();
store.set(
  "gallery.session",
  JSON.stringify({ token: "t", username: "alice" }),
);
(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => store.set(key, value),
  removeItem: (key: string) => store.delete(key),
};

expect(
  renderToString(<App />),
  ["Signed in as", "alice", "Sign out", "Upload an image", "PNG or JPEG"],
  "signed-in",
);

console.log("ALL SMOKE PASSED");

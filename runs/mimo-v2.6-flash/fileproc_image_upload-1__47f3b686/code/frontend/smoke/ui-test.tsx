import { JSDOM } from "jsdom";

const BASE = "http://127.0.0.1:8000";

const dom = new JSDOM(
  "<!doctype html><html><body><div id='root'></div></body></html>",
  { url: BASE + "/", pretendToBeVisual: true },
);

function setGlobal(key: string, value: unknown) {
  Object.defineProperty(globalThis, key, {
    value,
    writable: true,
    configurable: true,
  });
}

setGlobal("window", dom.window);
setGlobal("document", dom.window.document);
setGlobal("navigator", dom.window.navigator);
setGlobal("HTMLElement", dom.window.HTMLElement);
setGlobal("HTMLInputElement", dom.window.HTMLInputElement);
setGlobal("HTMLButtonElement", dom.window.HTMLButtonElement);
setGlobal("HTMLFormElement", dom.window.HTMLFormElement);
setGlobal("Element", dom.window.Element);
setGlobal("Event", dom.window.Event);
setGlobal("MouseEvent", dom.window.MouseEvent);
setGlobal("FileReader", dom.window.FileReader);
setGlobal("Blob", dom.window.Blob);
setGlobal("File", dom.window.File);
setGlobal("getComputedStyle", dom.window.getComputedStyle.bind(dom.window));
setGlobal("MutationObserver", dom.window.MutationObserver);
setGlobal("IS_REACT_ACT_ENVIRONMENT", true);

const store = new Map<string, string>();
setGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});

dom.window.confirm = () => true;

const realFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url =
    typeof input === "string"
      ? new URL(input, BASE)
      : input instanceof URL
        ? input
        : new URL(input.url, BASE);
  console.log("FETCH >", init?.method ?? "GET", url.toString());
      return realFetch(url, init).then((r) => { console.log("FETCH <", r.status, url.toString()); return r; }, (e) => { console.log("FETCH !", e?.message, url.toString()); throw e; });
}) as typeof fetch;

if (typeof (Blob.prototype as { arrayBuffer?: unknown }).arrayBuffer !== "function") {
  (Blob.prototype as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer = function (
    this: Blob,
  ) {
    return new Promise((resolve, reject) => {
      const fr = new dom.window.FileReader();
      fr.onload = () => resolve(fr.result as ArrayBuffer);
      fr.onerror = () => reject(fr.error);
      fr.readAsArrayBuffer(this);
    });
  };
}

const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { default: App } = await import("../src/App");

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
function $(sel: string): HTMLElement {
  const el = document.querySelector(sel);
  if (!el) throw new Error(`missing element: ${sel}`);
  return el as HTMLElement;
}
function text(): string {
  return document.body.textContent ?? "";
}
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
  console.log(`PASS ${msg}`);
}
async function setInput(sel: string, value: string) {
  const el = $(sel) as HTMLInputElement;
  await act(async () => {
    const proto = Object.getPrototypeOf(el) as { value: string };
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    desc!.set!.call(el, value);
    el.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}
async function flush() {
  await act(async () => {
    await sleep(120);
  });
}
async function click(el: Element) {
  await act(async () => {
    (el as HTMLElement).click();
  });
  await flush();
}
function submitForm(form: HTMLFormElement) {
  return act(async () => {
    form.dispatchEvent(
      new dom.window.Event("submit", { bubbles: true, cancelable: true }),
    );
  });
}
function formFor(inputId: string): HTMLFormElement {
  const input = $(`#${inputId}`);
  const form = input.closest("form");
  if (!form) throw new Error(`no form for #${inputId}`);
  return form as HTMLFormElement;
}
function submitButton(form: HTMLFormElement): HTMLButtonElement {
  const btn = form.querySelector("button[type=submit]");
  if (!btn) throw new Error("no submit button");
  return btn as HTMLButtonElement;
}

try {
  const root = createRoot($("#root"));
  await act(async () => {
    root.render(<App />);
  });
  await flush();
  assert(text().includes("Image Gallery"), "app title renders");
  assert(text().includes("Create account"), "signed-out shows auth forms");
  assert(text().includes("Browsing as guest"), "signed-out shows guest notice");
  assert(text().includes("No images yet"), "empty gallery state");

  // register: empty fields show validation error (submit dispatched directly)
  await submitForm(formFor("register-username"));
  await flush();
  assert(
    text().includes("Enter a username and a password."),
    "empty register shows error",
  );

  // register success
  await setInput("#register-username", "alice");
  await setInput("#register-password", "secret1");
  await click(submitButton(formFor("register-username")));
  assert(text().includes("Signed in as alice"), "register signs user in");
  assert(text().includes("Upload an image"), "signed-in shows upload form");
  assert(store.has("gallery.session"), "session persisted to storage");

  // upload a real PNG
  const png = Uint8Array.from(
    atob(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    ),
    (c) => c.charCodeAt(0),
  );
  const file = new File([png], "pixel.png", { type: "image/png" });
  const fileInput = $("#upload-file") as HTMLInputElement;
  await act(async () => {
    Object.defineProperty(fileInput, "files", {
      value: [file],
      configurable: true,
    });
    fileInput.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    await sleep(200);
  });
  assert(text().includes("pixel.png"), "upload form shows chosen file");
  assert(
    text().includes("Remove file"),
    "preview with remove button rendered",
  );

  const uploadForm = formFor("upload-title");
  assert(
    !submitButton(uploadForm).disabled,
    "upload button enabled after file chosen",
  );
  await click(submitButton(uploadForm));
  assert(text().includes("1 image"), "gallery shows uploaded image");
  assert(
    !text().includes("Remove file"),
    "upload preview reset after upload",
  );

  // open detail dialog
  const card = $("section[aria-label='Gallery'] .grid button");
  await click(card);
  assert(!!document.querySelector("[role=dialog]"), "detail dialog opens");
  const dialog = document.querySelector("[role=dialog]")!;
  assert(dialog.textContent!.includes("pixel.png"), "detail shows filename");
  assert(dialog.textContent!.includes("alice"), "detail shows uploader");

  // delete own image
  const deleteBtn = Array.from(dialog.querySelectorAll("button")).find(
    (b) => b.textContent === "Delete",
  );
  assert(!!deleteBtn, "delete button visible for owner");
  await click(deleteBtn!);
  assert(!document.querySelector("[role=dialog]"), "dialog closes after delete");
  assert(text().includes("Deleted"), "delete notice shown");
  assert(text().includes("No images yet"), "gallery empty after delete");

  // sign out
  const signOut = Array.from(document.querySelectorAll("button")).find(
    (b) => b.textContent === "Sign out",
  );
  assert(!!signOut, "sign out button visible");
  await click(signOut!);
  assert(text().includes("Create account"), "sign out returns to auth forms");
  assert(!store.has("gallery.session"), "session cleared from storage");

  // bad login
  await setInput("#login-username", "alice");
  await setInput("#login-password", "wrong");
  await click(submitButton(formFor("login-username")));
  const loginForm = formFor("login-username");
  assert(
    !!loginForm.querySelector("[role=alert]"),
    "bad login shows error banner",
  );

  // good login
  await setInput("#login-password", "secret1");
  await click(submitButton(formFor("login-username")));
  assert(text().includes("Signed in as alice"), "login succeeds");

  console.log("ALL UI TESTS PASSED");
  process.exit(0);
} catch (err) {
  console.error("UI TEST FAILED:", (err as Error).message);
  console.error("BODY TEXT:", text().slice(0, 1500));
  process.exit(1);
}

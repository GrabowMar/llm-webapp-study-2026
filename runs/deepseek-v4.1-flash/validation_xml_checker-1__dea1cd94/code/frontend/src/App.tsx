import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";

type ValidationResult = {
  valid: boolean;
  error: string | null;
  line: number | null;
  column: number | null;
  root_element: string | null;
};

type SavedValidation = ValidationResult & {
  id: number;
  xml_preview: string;
  created_at: string;
};

type Page = {
  items: SavedValidation[];
  total: number;
  page: number;
  page_size: number;
};

type AuthState = { token: string; username: string } | null;

const TOKEN_KEY = "xml-checker-token";
const NAME_KEY = "xml-checker-username";
const PAGE_SIZE = 5;

async function api<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(path, { ...init, headers });
  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error: unknown }).error)
        : `Request failed (${response.status})`;
    throw new Error(message);
  }
  return payload as T;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export default function App() {
  const [auth, setAuth] = useState<AuthState>(null);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);

  const [xml, setXml] = useState("");
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [checkedXml, setCheckedXml] = useState("");
  const [checkError, setCheckError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [save, setSave] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const errorLineRef = useRef<HTMLDivElement | null>(null);

  const [history, setHistory] = useState<Page | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyFilter, setHistoryFilter] = useState<"all" | "valid" | "invalid">("all");
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyBusy, setHistoryBusy] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    const username = localStorage.getItem(NAME_KEY);
    if (!token || !username) return;
    api<{ id: number; username: string }>("/api/auth/me", {}, token)
      .then((me) => setAuth({ token, username: me.username }))
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(NAME_KEY);
      });
  }, []);

  const loadHistory = useCallback(async () => {
    if (!auth) {
      setHistory(null);
      return;
    }
    setHistoryBusy(true);
    setHistoryError(null);
    try {
      const params = new URLSearchParams({
        page: String(historyPage),
        page_size: String(PAGE_SIZE),
      });
      if (historyFilter !== "all") params.set("valid", String(historyFilter === "valid"));
      const page = await api<Page>(`/api/validations?${params.toString()}`, {}, auth.token);
      const lastPage = Math.max(1, Math.ceil(page.total / page.page_size));
      if (page.items.length === 0 && historyPage > lastPage) {
        setHistoryPage(lastPage);
        return;
      }
      setHistory(page);
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : "Could not load history");
    } finally {
      setHistoryBusy(false);
    }
  }, [auth, historyPage, historyFilter]);

  useEffect(() => {
    if (auth) void loadHistory();
    else setHistory(null);
  }, [auth, loadHistory]);

  useEffect(() => {
    if (result && !result.valid && errorLineRef.current) {
      errorLineRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [result]);

  const submitAuth = async (event: FormEvent) => {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError(null);
    try {
      const username = authUsername.trim();
      if (authMode === "register") {
        await api("/api/auth/register", {
          method: "POST",
          body: JSON.stringify({ username, password: authPassword }),
        });
      }
      const data = await api<{ token: string }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password: authPassword }),
      });
      const me = await api<{ id: number; username: string }>("/api/auth/me", {}, data.token);
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(NAME_KEY, me.username);
      setAuth({ token: data.token, username: me.username });
      setAuthPassword("");
      setAuthError(null);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setAuthBusy(false);
    }
  };

  const signOut = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(NAME_KEY);
    setAuth(null);
    setSave(false);
    setHistory(null);
    setHistoryPage(1);
    setHistoryFilter("all");
  };

  const runCheck = async () => {
    setChecking(true);
    setCheckError(null);
    try {
      if (auth && save) {
        const saved = await api<SavedValidation>(
          "/api/validations",
          { method: "POST", body: JSON.stringify({ xml }) },
          auth.token,
        );
        setResult(saved);
        if (historyPage !== 1) setHistoryPage(1);
        else void loadHistory();
      } else {
        const checked = await api<ValidationResult>("/api/validate/xml", {
          method: "POST",
          body: JSON.stringify({ xml }),
        });
        setResult(checked);
      }
      setCheckedXml(xml);
    } catch (err) {
      setCheckError(err instanceof Error ? err.message : "Could not check the document");
    } finally {
      setChecking(false);
    }
  };

  const removeSaved = async (id: number) => {
    if (!auth) return;
    setHistoryBusy(true);
    setHistoryError(null);
    try {
      await api(`/api/validations/${id}`, { method: "DELETE" }, auth.token);
      const remaining = (history?.items.length ?? 0) - 1;
      if (remaining === 0 && historyPage > 1) setHistoryPage((page) => page - 1);
      else void loadHistory();
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : "Could not delete the check");
    } finally {
      setHistoryBusy(false);
    }
  };

  const loadFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setXml(await file.text());
      setCheckError(null);
    } catch {
      setCheckError("Could not read that file");
    } finally {
      event.target.value = "";
    }
  };

  const lines = checkedXml.split("\n");
  const totalPages = history ? Math.max(1, Math.ceil(history.total / history.page_size)) : 1;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">XML Well-formedness Checker</h1>
            <p className="text-sm text-slate-500">Syntax only — no schema validation, no external fetching.</p>
          </div>
          <div className="flex items-center gap-3">
            {auth ? (
              <>
                <span className="text-sm text-slate-600">
                  Signed in as <span className="font-medium text-slate-900">{auth.username}</span>
                </span>
                <button
                  type="button"
                  onClick={signOut}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Sign out
                </button>
              </>
            ) : (
              <span className="text-sm text-slate-500">Not signed in</span>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="flex flex-col gap-6">
          {!auth && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode("login");
                    setAuthError(null);
                  }}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                    authMode === "login" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-700"
                  }`}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode("register");
                    setAuthError(null);
                  }}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                    authMode === "register" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-700"
                  }`}
                >
                  Register
                </button>
              </div>
              <form onSubmit={submitAuth} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <label className="flex flex-1 flex-col gap-1 text-sm">
                  <span className="font-medium text-slate-700">Username</span>
                  <input
                    value={authUsername}
                    onChange={(event) => setAuthUsername(event.target.value)}
                    autoComplete="username"
                    required
                    className="rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                  />
                </label>
                <label className="flex flex-1 flex-col gap-1 text-sm">
                  <span className="font-medium text-slate-700">Password</span>
                  <input
                    type="password"
                    value={authPassword}
                    onChange={(event) => setAuthPassword(event.target.value)}
                    autoComplete={authMode === "register" ? "new-password" : "current-password"}
                    required
                    className="rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                  />
                </label>
                <button
                  type="submit"
                  disabled={authBusy}
                  className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {authBusy ? "Please wait…" : authMode === "register" ? "Create account" : "Sign in"}
                </button>
              </form>
              {authError && <p className="mt-3 text-sm text-red-600">{authError}</p>}
            </div>
          )}

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-semibold">Document</h2>
              <div className="flex items-center gap-3">
                <input ref={fileInput} type="file" accept=".xml,text/xml,application/xml" onChange={loadFile} className="hidden" />
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Load file
                </button>
                {auth && (
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      role="switch"
                      aria-checked={save}
                      checked={save}
                      onChange={(event) => setSave(event.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    Save
                  </label>
                )}
                <button
                  type="button"
                  onClick={() => void runCheck()}
                  disabled={checking}
                  className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {checking ? "Checking…" : "Check"}
                </button>
              </div>
            </div>
            <textarea
              value={xml}
              onChange={(event) => setXml(event.target.value)}
              spellCheck={false}
              placeholder={'<?xml version="1.0"?>\n<root>\n  <child/>\n</root>'}
              className="h-72 w-full resize-y rounded-lg border border-slate-300 bg-slate-950 p-4 font-mono text-sm text-slate-100 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-300"
            />
            {checkError && <p className="mt-3 text-sm text-red-600">{checkError}</p>}
          </div>

          {result && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-3 text-base font-semibold">Result</h2>
              {result.valid ? (
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-800">Well-formed</span>
                  <span className="text-sm text-slate-600">
                    Root element: <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-900">{result.root_element}</code>
                  </span>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="rounded-full bg-red-100 px-3 py-1 text-sm font-semibold text-red-800">Not well-formed</span>
                    <span className="text-sm text-slate-600">
                      {result.line !== null && result.column !== null
                        ? `Line ${result.line}, column ${result.column}`
                        : "Unknown position"}
                    </span>
                  </div>
                  <p className="rounded-lg bg-red-50 p-3 font-mono text-sm text-red-700">{result.error ?? "Invalid XML"}</p>
                </div>
              )}

              <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
                <div className="max-h-72 overflow-auto bg-slate-50 py-2 font-mono text-xs">
                  {lines.map((line, index) => {
                    const number = index + 1;
                    const isError = !result.valid && result.line === number;
                    return (
                      <div
                        key={number}
                        ref={isError ? errorLineRef : undefined}
                        className={`flex ${isError ? "bg-red-100 text-red-900" : "text-slate-700"}`}
                      >
                        <span className={`w-12 shrink-0 select-none border-r border-slate-200 pr-2 text-right ${isError ? "text-red-600" : "text-slate-400"}`}>
                          {number}
                        </span>
                        <span className="whitespace-pre-wrap break-all px-3">{line === "" ? " " : line}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </section>

        <aside className="flex flex-col gap-6">
          {auth ? (
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-base font-semibold">Saved checks</h2>
                <div className="flex gap-1 rounded-md bg-slate-100 p-1">
                  {(["all", "valid", "invalid"] as const).map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      onClick={() => {
                        setHistoryFilter(filter);
                        setHistoryPage(1);
                      }}
                      className={`rounded px-2.5 py-1 text-xs font-medium capitalize ${
                        historyFilter === filter ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      {filter}
                    </button>
                  ))}
                </div>
              </div>

              {historyError && <p className="mb-3 text-sm text-red-600">{historyError}</p>}
              {historyBusy && <p className="mb-3 text-sm text-slate-500">Loading…</p>}
              {!historyBusy && history && history.items.length === 0 && (
                <p className="text-sm text-slate-500">No saved checks yet.</p>
              )}

              <ul className="flex flex-col gap-3">
                {history?.items.map((item) => (
                  <li key={item.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          item.valid ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                        }`}
                      >
                        {item.valid ? "Valid" : "Invalid"}
                      </span>
                      <button
                        type="button"
                        onClick={() => void removeSaved(item.id)}
                        disabled={historyBusy}
                        className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                    <pre className="mb-2 max-h-24 overflow-auto whitespace-pre-wrap break-all rounded bg-slate-50 p-2 font-mono text-xs text-slate-700">
                      {item.xml_preview}
                    </pre>
                    <p className="text-xs text-slate-500">
                      {item.valid
                        ? `Root: ${item.root_element ?? "—"}`
                        : `${item.error ?? "Invalid XML"} (line ${item.line ?? "?"}, column ${item.column ?? "?"})`}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">{formatDate(item.created_at)}</p>
                  </li>
                ))}
              </ul>

              <div className="mt-4 flex items-center justify-between gap-2 text-sm">
                <button
                  type="button"
                  onClick={() => setHistoryPage((page) => Math.max(1, page - 1))}
                  disabled={historyPage <= 1 || historyBusy}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="text-slate-600">
                  Page {history?.page ?? historyPage} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setHistoryPage((page) => page + 1)}
                  disabled={historyPage >= totalPages || historyBusy}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-2 text-base font-semibold">History</h2>
              <p className="text-sm text-slate-500">Sign in to save checks and keep a private history.</p>
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}

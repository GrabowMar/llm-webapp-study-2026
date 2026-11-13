import { type ChangeEvent, type FormEvent, useCallback, useEffect, useState } from "react";
import {
  ApiError,
  type CheckResult,
  type SavedCheck,
  deleteValidation,
  listValidations,
  login,
  register,
  saveValidation,
  validateXml,
} from "./api";

const PAGE_SIZE = 10;

type AuthMode = "login" | "register";
type HistoryFilter = "all" | "valid" | "invalid";

function tabClass(active: boolean): string {
  return `rounded-md px-3 py-1.5 text-sm font-medium transition ${
    active ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
  }`;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong";
}

export default function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("token"));
  const [username, setUsername] = useState<string | null>(() => localStorage.getItem("username"));

  const [mode, setMode] = useState<AuthMode>("login");
  const [authUser, setAuthUser] = useState("");
  const [authPass, setAuthPass] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);

  const [xml, setXml] = useState("");
  const [checkedXml, setCheckedXml] = useState<string | null>(null);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [saveToHistory, setSaveToHistory] = useState(false);

  const [items, setItems] = useState<SavedCheck[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const signedIn = token !== null && username !== null;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const signOut = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    setToken(null);
    setUsername(null);
    setItems([]);
    setTotal(0);
    setPage(1);
    setSaveToHistory(false);
  }, []);

  useEffect(() => {
    if (!token) {
      setItems([]);
      setTotal(0);
      return;
    }
    let cancelled = false;
    const valid = filter === "all" ? null : filter === "valid";
    listValidations(token, { valid, page, page_size: PAGE_SIZE })
      .then((data) => {
        if (cancelled) return;
        if (data.items.length === 0 && data.total > 0 && data.page > 1) {
          setPage(data.page - 1);
          return;
        }
        setItems(data.items);
        setTotal(data.total);
        setHistoryError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          signOut();
          setHistoryError("Your session expired. Please sign in again.");
        } else {
          setHistoryError(errorMessage(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token, page, filter, refreshKey, signOut]);

  async function handleAuthSubmit(event: FormEvent) {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError(null);
    try {
      if (mode === "register") {
        await register(authUser, authPass);
      }
      const data = await login(authUser, authPass);
      localStorage.setItem("token", data.token);
      localStorage.setItem("username", authUser.trim());
      setToken(data.token);
      setUsername(authUser.trim());
      setAuthUser("");
      setAuthPass("");
      setPage(1);
    } catch (err) {
      setAuthError(errorMessage(err));
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      setXml(await file.text());
      setActionError(null);
    } catch {
      setActionError("Could not read the selected file.");
    }
  }

  async function handleCheck() {
    setBusy(true);
    setActionError(null);
    setJustSaved(false);
    try {
      const shouldSave = saveToHistory && token !== null;
      const data = shouldSave
        ? await saveValidation(xml, token as string)
        : await validateXml(xml);
      setResult(data);
      setCheckedXml(xml);
      if (shouldSave) {
        setJustSaved(true);
        setRefreshKey((key) => key + 1);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        signOut();
        setActionError("Your session expired. Please sign in again.");
      } else {
        setActionError(errorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: number) {
    if (!token) return;
    try {
      await deleteValidation(token, id);
      setRefreshKey((key) => key + 1);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        signOut();
        setHistoryError("Your session expired. Please sign in again.");
      } else {
        setHistoryError(errorMessage(err));
      }
    }
  }

  const checkedLines = (checkedXml ?? xml).split("\n");

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">XML Well-formedness Checker</h1>
            <p className="text-xs text-slate-500">Syntax only — no schema validation, nothing is fetched</p>
          </div>
          {signedIn ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-600">
                Signed in as{" "}
                <span className="font-medium text-slate-900">{username}</span>
              </span>
              <button
                type="button"
                onClick={signOut}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Sign out
              </button>
            </div>
          ) : (
            <form onSubmit={handleAuthSubmit} className="flex flex-col items-end gap-1">
              <div className="flex flex-wrap items-center justify-end gap-2">
                <div className="flex rounded-lg bg-slate-100 p-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setMode("login");
                      setAuthError(null);
                    }}
                    className={tabClass(mode === "login")}
                  >
                    Sign in
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMode("register");
                      setAuthError(null);
                    }}
                    className={tabClass(mode === "register")}
                  >
                    Register
                  </button>
                </div>
                <input
                  value={authUser}
                  onChange={(event) => setAuthUser(event.target.value)}
                  placeholder="Username"
                  aria-label="Username"
                  autoComplete="username"
                  className="w-32 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                />
                <input
                  type="password"
                  value={authPass}
                  onChange={(event) => setAuthPass(event.target.value)}
                  placeholder="Password"
                  aria-label="Password"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  className="w-32 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                />
                <button
                  type="submit"
                  disabled={authBusy}
                  className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                >
                  {authBusy ? "Working…" : mode === "login" ? "Sign in" : "Create account"}
                </button>
              </div>
              {authError && <p className="text-xs font-medium text-red-600">{authError}</p>}
            </form>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-5 px-4 py-6">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Document</h2>
            <div className="flex flex-wrap items-center gap-3">
              <label className="cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Load file
                <input
                  type="file"
                  accept=".xml,.txt,text/xml,application/xml,text/plain"
                  onChange={handleFile}
                  className="hidden"
                />
              </label>
              {signedIn && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={saveToHistory}
                    aria-label="Save checks to history"
                    onClick={() => setSaveToHistory((value) => !value)}
                    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition ${
                      saveToHistory ? "bg-emerald-600" : "bg-slate-300"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
                        saveToHistory ? "translate-x-4" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                  <span className="text-sm text-slate-600">Save</span>
                </div>
              )}
              <button
                type="button"
                onClick={handleCheck}
                disabled={busy}
                className="rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {busy ? "Checking…" : "Check"}
              </button>
            </div>
          </div>
          <textarea
            value={xml}
            onChange={(event) => setXml(event.target.value)}
            rows={12}
            spellCheck={false}
            aria-label="XML document"
            placeholder={'Paste XML here, e.g. <root>\n  <child/>\n</root>'}
            className="w-full resize-y rounded-lg border border-slate-300 bg-slate-50 p-3 font-mono text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          {actionError && (
            <p className="mt-2 text-sm font-medium text-red-600">{actionError}</p>
          )}
        </section>

        {result && (
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            {result.valid ? (
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-700">
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                    <path
                      fillRule="evenodd"
                      d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.8 6.8-6.8a1 1 0 0 1 1.4 0Z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Well-formed
                </span>
                <span className="text-sm text-slate-600">
                  Root element:{" "}
                  <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-sm text-slate-800">
                    {result.root_element ?? "—"}
                  </code>
                </span>
                {justSaved && (
                  <span className="text-sm text-emerald-700">Saved to your history.</span>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-sm font-semibold text-red-700">
                    Not well-formed
                  </span>
                  <span className="text-sm font-medium text-red-700">{result.error}</span>
                  <span className="text-sm text-slate-600">
                    Line <span className="font-medium">{result.line}</span>, column{" "}
                    <span className="font-medium">{result.column}</span>
                  </span>
                  {result.root_element && (
                    <span className="text-sm text-slate-500">
                      Started root element:{" "}
                      <code className="font-mono text-slate-700">{result.root_element}</code>
                    </span>
                  )}
                  {justSaved && <span className="text-sm text-emerald-700">Saved to your history.</span>}
                </div>
                <pre className="max-h-80 overflow-auto rounded-lg bg-slate-900 p-3 text-sm leading-5 text-slate-100">
                  <code className="block font-mono">
                    {checkedLines.map((line, index) => {
                      const isErrorLine = index + 1 === result.line;
                      return (
                        <div
                          key={index}
                          className={`flex gap-3 ${
                            isErrorLine ? "bg-red-500/40 text-red-50" : ""
                          }`}
                        >
                          <span className="w-10 shrink-0 select-none text-right text-slate-500 tabular-nums">
                            {index + 1}
                          </span>
                          <span className="whitespace-pre-wrap break-all">
                            {line.length > 0 ? line : " "}
                          </span>
                        </div>
                      );
                    })}
                  </code>
                </pre>
              </div>
            )}
          </section>
        )}

        {signedIn && (
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Saved checks
              </h2>
              <div className="flex rounded-lg border border-slate-200 bg-slate-100 p-0.5">
                {(
                  [
                    ["all", "All"],
                    ["valid", "Well-formed"],
                    ["invalid", "Invalid"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setFilter(value);
                      setPage(1);
                    }}
                    className={`rounded-md px-3 py-1 text-sm font-medium transition ${
                      filter === value
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {historyError && <p className="mb-2 text-sm font-medium text-red-600">{historyError}</p>}

            {items.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">
                {historyError ? "Nothing to show." : "No saved checks yet. Turn on Save and press Check."}
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {items.map((item) => (
                  <li key={item.id} className="flex items-start gap-3 py-2.5">
                    <span
                      className={`mt-0.5 inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                        item.valid
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {item.valid ? "Valid" : "Invalid"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-xs text-slate-700">
                        {item.xml_preview.length > 0 ? item.xml_preview : "(empty document)"}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {item.valid
                          ? `Root element: ${item.root_element ?? "—"}`
                          : `${item.error} (line ${item.line}, column ${item.column})`}
                        {" · "}
                        {formatDate(item.created_at)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDelete(item.id)}
                      className="shrink-0 rounded-md px-2 py-1 text-sm font-medium text-red-600 hover:bg-red-50 hover:text-red-700"
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 text-sm text-slate-600">
              <span>
                {total} saved · Page {page} of {totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((value) => value + 1)}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

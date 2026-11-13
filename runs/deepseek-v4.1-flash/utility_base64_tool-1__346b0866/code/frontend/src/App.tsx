import { useCallback, useEffect, useRef, useState } from "react";

type Conversion = {
  id: number;
  direction: "encode" | "decode";
  input_preview: string;
  output_preview: string;
  created_at: string;
  output?: string;
};

type Page = {
  items: Conversion[];
  total: number;
  page: number;
  page_size: number;
};

const PAGE_SIZE = 10;
const TOKEN_KEY = "b64_token";
const USER_KEY = "b64_user";

async function api<T>(path: string, options: RequestInit = {}, token?: string | null): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(path, { ...options, headers });
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    const message =
      data && typeof data === "object" && "error" in data && typeof (data as { error: unknown }).error === "string"
        ? (data as { error: string }).error
        : `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data as T;
}

export default function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [username, setUsername] = useState<string | null>(() => localStorage.getItem(USER_KEY));

  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);

  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [convertError, setConvertError] = useState("");
  const [convertBusy, setConvertBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const [saveToHistory, setSaveToHistory] = useState(true);
  const [historyPage, setHistoryPage] = useState(1);
  const [history, setHistory] = useState<Page | null>(null);
  const [historyError, setHistoryError] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);

  const outputRef = useRef<HTMLTextAreaElement>(null);

  const signOut = useCallback(() => {
    if (token) {
      api("/api/auth/logout", { method: "POST" }, token).catch(() => undefined);
    }
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUsername(null);
    setHistory(null);
    setHistoryError("");
    setHistoryPage(1);
  }, [token]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    api<{ username: string }>("/api/auth/me", {}, token)
      .then((me) => {
        if (cancelled) return;
        setUsername(me.username);
        localStorage.setItem(USER_KEY, me.username);
      })
      .catch(() => {
        if (!cancelled) signOut();
      });
    return () => {
      cancelled = true;
    };
  }, [token, signOut]);

  const loadHistory = useCallback(
    async (page: number) => {
      if (!token) return;
      setHistoryLoading(true);
      setHistoryError("");
      try {
        const data = await api<Page>(
          `/api/conversions?page=${page}&page_size=${PAGE_SIZE}`,
          {},
          token,
        );
        setHistory(data);
        setHistoryPage(data.page);
      } catch (err) {
        setHistoryError(err instanceof Error ? err.message : "Failed to load history");
      } finally {
        setHistoryLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    if (token) {
      loadHistory(historyPage);
    }
  }, [token, historyPage, loadHistory]);

  async function submitAuth(event: React.FormEvent) {
    event.preventDefault();
    setAuthError("");
    setAuthBusy(true);
    try {
      const creds = { username: authUsername, password: authPassword };
      if (authMode === "register") {
        await api("/api/auth/register", { method: "POST", body: JSON.stringify(creds) });
      }
      const result = await api<{ token: string; username: string }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(creds),
      });
      localStorage.setItem(TOKEN_KEY, result.token);
      localStorage.setItem(USER_KEY, result.username);
      setToken(result.token);
      setUsername(result.username);
      setAuthPassword("");
      setHistoryPage(1);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setAuthBusy(false);
    }
  }

  async function run(direction: "encode" | "decode") {
    setConvertError("");
    setCopied(false);
    setConvertBusy(true);
    try {
      let value: string;
      if (token && saveToHistory) {
        const created = await api<Conversion>(
          "/api/conversions",
          { method: "POST", body: JSON.stringify({ direction, input }) },
          token,
        );
        value = created.output ?? "";
        if (historyPage === 1) {
          loadHistory(1);
        } else {
          setHistoryPage(1);
        }
      } else if (direction === "encode") {
        const res = await api<{ encoded: string }>("/api/base64/encode", {
          method: "POST",
          body: JSON.stringify({ text: input }),
        });
        value = res.encoded;
      } else {
        const res = await api<{ text: string }>("/api/base64/decode", {
          method: "POST",
          body: JSON.stringify({ encoded: input }),
        });
        value = res.text;
      }
      setOutput(value);
    } catch (err) {
      setConvertError(err instanceof Error ? err.message : "Conversion failed");
    } finally {
      setConvertBusy(false);
    }
  }

  async function copyOutput() {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      outputRef.current?.select();
      setConvertError("Could not access the clipboard");
    }
  }

  async function deleteConversion(id: number) {
    if (!token) return;
    try {
      await api(`/api/conversions/${id}`, { method: "DELETE" }, token);
      const remaining = (history?.items.length ?? 1) - 1;
      if (remaining === 0 && historyPage > 1) {
        setHistoryPage(historyPage - 1);
      } else {
        loadHistory(historyPage);
      }
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : "Failed to delete conversion");
    }
  }

  const totalPages = history ? Math.max(1, Math.ceil(history.total / history.page_size)) : 1;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Base64 Converter</h1>
            <p className="text-sm text-slate-500">Encode UTF-8 text to base64 and back.</p>
          </div>
          {username ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-600">
                Signed in as <span className="font-medium text-slate-900">{username}</span>
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
            <span className="text-sm text-slate-500">Convert without signing in</span>
          )}
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-6 px-4 py-6 lg:grid-cols-[1fr_20rem]">
        <section className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label
                  htmlFor="input"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Input <span className="font-normal text-slate-400">(text or base64)</span>
                </label>
                <textarea
                  id="input"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  rows={10}
                  spellCheck={false}
                  placeholder="Type UTF-8 text to encode, or paste base64 to decode..."
                  className="w-full resize-y rounded-lg border border-slate-300 bg-slate-50 p-3 font-mono text-sm outline-none focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-200"
                />
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label htmlFor="output" className="block text-sm font-medium text-slate-700">
                    Output
                  </label>
                  <button
                    type="button"
                    onClick={copyOutput}
                    disabled={!output}
                    className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
                <textarea
                  id="output"
                  ref={outputRef}
                  value={output}
                  readOnly
                  rows={10}
                  spellCheck={false}
                  placeholder="Result appears here..."
                  className="w-full resize-y rounded-lg border border-slate-300 bg-slate-50 p-3 font-mono text-sm outline-none"
                />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => run("encode")}
                  disabled={convertBusy}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
                >
                  Encode
                </button>
                <button
                  type="button"
                  onClick={() => run("decode")}
                  disabled={convertBusy}
                  className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-900 disabled:opacity-50"
                >
                  Decode
                </button>
              </div>
              {token && (
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={saveToHistory}
                    onChange={(e) => setSaveToHistory(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  Save to history
                </label>
              )}
            </div>

            {convertError && (
              <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {convertError}
              </p>
            )}
          </div>

          {token && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold">Your history</h2>
                <span className="text-xs text-slate-500">
                  {history ? `${history.total} saved` : ""}
                </span>
              </div>

              {historyError && (
                <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                  {historyError}
                </p>
              )}

              {historyLoading && !history ? (
                <p className="mt-4 text-sm text-slate-500">Loading...</p>
              ) : history && history.items.length > 0 ? (
                <ul className="mt-3 divide-y divide-slate-200">
                  {history.items.map((item) => (
                    <li key={item.id} className="flex items-start justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${
                              item.direction === "encode"
                                ? "bg-indigo-100 text-indigo-700"
                                : "bg-emerald-100 text-emerald-700"
                            }`}
                          >
                            {item.direction}
                          </span>
                          <span className="text-xs text-slate-400">
                            {new Date(item.created_at).toLocaleString()}
                          </span>
                        </div>
                        <p className="mt-1 truncate font-mono text-xs text-slate-600">
                          {item.input_preview}
                        </p>
                        <p className="truncate font-mono text-xs text-slate-400">
                          {item.output_preview}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => deleteConversion(item.id)}
                        className="shrink-0 rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-sm text-slate-500">
                  No conversions yet. Convert with the switch on to save one.
                </p>
              )}

              <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3">
                <button
                  type="button"
                  onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                  disabled={historyPage <= 1 || historyLoading}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="text-sm text-slate-600">
                  Page {historyPage} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setHistoryPage((p) => Math.min(totalPages, p + 1))}
                  disabled={historyPage >= totalPages || historyLoading}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </section>

        {!token && (
          <aside className="self-start rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => {
                  setAuthMode("login");
                  setAuthError("");
                }}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  authMode === "login" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                }`}
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode("register");
                  setAuthError("");
                }}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  authMode === "register" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                }`}
              >
                Register
              </button>
            </div>

            <form onSubmit={submitAuth} className="space-y-3">
              <div>
                <label htmlFor="username" className="mb-1 block text-sm font-medium text-slate-700">
                  Username
                </label>
                <input
                  id="username"
                  value={authUsername}
                  onChange={(e) => setAuthUsername(e.target.value)}
                  autoComplete="username"
                  required
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                />
              </div>
              <div>
                <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  autoComplete={authMode === "login" ? "current-password" : "new-password"}
                  required
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                />
              </div>
              <button
                type="submit"
                disabled={authBusy}
                className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
              >
                {authBusy
                  ? "Please wait..."
                  : authMode === "login"
                    ? "Sign in"
                    : "Create account"}
              </button>
            </form>

            {authError && (
              <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {authError}
              </p>
            )}

            <p className="mt-4 text-xs leading-relaxed text-slate-500">
              Sign in to save conversions to a private history only you can see.
            </p>
          </aside>
        )}
      </main>
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";

interface Conversion {
  id: number;
  direction: "encode" | "decode";
  input_preview: string;
  output_preview: string;
  created_at: string;
  output?: string;
}

interface Page {
  items: Conversion[];
  total: number;
  page: number;
  page_size: number;
}

const TOKEN_KEY = "b64_token";

function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return fetch(`/api${path}`, { ...options, headers }).then(async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error((data as { error?: string }).error || "Request failed");
    }
    return data as T;
  });
}

function copyToClipboard(text: string) {
  if (navigator.clipboard) {
    return navigator.clipboard.writeText(text);
  }
  const el = document.createElement("textarea");
  el.value = text;
  document.body.appendChild(el);
  el.select();
  document.execCommand("copy");
  document.body.removeChild(el);
  return Promise.resolve();
}

export default function App() {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem(TOKEN_KEY)
  );
  const [username, setUsername] = useState("");
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [mode, setMode] = useState<"login" | "register">("login");

  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [saveHistory, setSaveHistory] = useState(false);

  const [history, setHistory] = useState<Page | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(5);
  const [historyError, setHistoryError] = useState("");

  const loadHistory = useCallback(
    async (p: number) => {
      if (!token) return;
      try {
        const data = await api<Page>(`/conversions?page=${p}&page_size=${pageSize}`);
        setHistory(data);
        setPage(data.page);
        setHistoryError("");
      } catch (e) {
        setHistoryError((e as Error).message);
      }
    },
    [token, pageSize]
  );

  useEffect(() => {
    loadHistory(1);
  }, [token, loadHistory]);

  const signOut = () => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setHistory(null);
  };

  const handleAuth = async () => {
    setAuthError("");
    try {
      if (mode === "register") {
        await api("/auth/register", {
          method: "POST",
          body: JSON.stringify({ username: authUsername, password: authPassword }),
        });
      }
      const data = await api<{ token: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: authUsername, password: authPassword }),
      });
      localStorage.setItem(TOKEN_KEY, data.token);
      setToken(data.token);
      setUsername(authUsername);
      setAuthPassword("");
    } catch (e) {
      setAuthError((e as Error).message);
    }
  };

  const run = async (direction: "encode" | "decode") => {
    setError("");
    setCopied(false);
    const body = direction === "encode" ? { text: input } : { encoded: input };
    try {
      if (token && saveHistory) {
        const data = await api<Conversion>("/conversions", {
          method: "POST",
          body: JSON.stringify({ direction, input }),
        });
        setOutput(data.output ?? "");
        loadHistory(1);
      } else if (direction === "encode") {
        const data = await api<{ encoded: string }>("/base64/encode", {
          method: "POST",
          body: JSON.stringify(body),
        });
        setOutput(data.encoded);
      } else {
        const data = await api<{ text: string }>("/base64/decode", {
          method: "POST",
          body: JSON.stringify(body),
        });
        setOutput(data.text);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api(`/conversions/${id}`, { method: "DELETE" });
      loadHistory(page);
    } catch (e) {
      setHistoryError((e as Error).message);
    }
  };

  const totalPages = history ? Math.max(1, Math.ceil(history.total / history.page_size)) : 1;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="bg-slate-900 text-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <h1 className="text-xl font-bold">Base64 Converter</h1>
          {token && (
            <div className="flex items-center gap-4">
              <span className="text-sm text-slate-300">Signed in as {username}</span>
              <button
                onClick={signOut}
                className="rounded bg-slate-700 px-3 py-1 text-sm hover:bg-slate-600"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-6">
        {!token && (
          <section className="rounded-lg bg-white p-6 shadow">
            <h2 className="mb-4 text-lg font-semibold">
              {mode === "login" ? "Sign in" : "Register"}
            </h2>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                className="flex-1 rounded border border-slate-300 px-3 py-2"
                placeholder="Username"
                value={authUsername}
                onChange={(e) => setAuthUsername(e.target.value)}
              />
              <input
                className="flex-1 rounded border border-slate-300 px-3 py-2"
                type="password"
                placeholder="Password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
              />
            </div>
            {authError && <p className="mt-3 text-sm text-red-600">{authError}</p>}
            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={handleAuth}
                className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
              >
                {mode === "login" ? "Sign in" : "Register"}
              </button>
              <button
                onClick={() => {
                  setMode(mode === "login" ? "register" : "login");
                  setAuthError("");
                }}
                className="text-sm text-blue-600 hover:underline"
              >
                {mode === "login" ? "Create an account" : "Have an account? Sign in"}
              </button>
            </div>
          </section>
        )}

        <section className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-lg font-semibold">Convert</h2>
          <div className="flex gap-3">
            <textarea
              className="min-h-32 flex-1 rounded border border-slate-300 p-3 font-mono"
              placeholder="Input text / base64"
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <textarea
              className="min-h-32 flex-1 rounded border border-slate-300 p-3 font-mono"
              placeholder="Output"
              value={output}
              readOnly
            />
          </div>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={() => run("encode")}
              className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            >
              Encode
            </button>
            <button
              onClick={() => run("decode")}
              className="rounded bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700"
            >
              Decode
            </button>
            <button
              onClick={() => {
                copyToClipboard(output);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="rounded border border-slate-300 px-4 py-2 hover:bg-slate-50"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
            {token && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={saveHistory}
                  onChange={(e) => setSaveHistory(e.target.checked)}
                />
                Save to history
              </label>
            )}
          </div>
        </section>

        {token && (
          <section className="rounded-lg bg-white p-6 shadow">
            <h2 className="mb-4 text-lg font-semibold">History</h2>
            {historyError && <p className="mb-3 text-sm text-red-600">{historyError}</p>}
            {history && history.items.length === 0 && (
              <p className="text-sm text-slate-500">No saved conversions yet.</p>
            )}
            {history && history.items.length > 0 && (
              <ul className="divide-y divide-slate-200">
                {history.items.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-4 py-3">
                    <div className="min-w-0 flex-1">
                      <span className="mr-2 rounded bg-slate-100 px-2 py-0.5 text-xs font-medium uppercase">
                        {c.direction}
                      </span>
                      <span className="text-sm text-slate-700">
                        {c.input_preview} &rarr; {c.output_preview}
                      </span>
                      <div className="mt-1 text-xs text-slate-400">
                        {new Date(c.created_at).toLocaleString()}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(c.id)}
                      className="rounded border border-red-300 px-3 py-1 text-sm text-red-600 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {history && totalPages > 1 && (
              <div className="mt-4 flex items-center gap-3">
                <button
                  disabled={page <= 1}
                  onClick={() => loadHistory(page - 1)}
                  className="rounded border border-slate-300 px-3 py-1 text-sm disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="text-sm text-slate-600">
                  Page {page} of {totalPages}
                </span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => loadHistory(page + 1)}
                  className="rounded border border-slate-300 px-3 py-1 text-sm disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

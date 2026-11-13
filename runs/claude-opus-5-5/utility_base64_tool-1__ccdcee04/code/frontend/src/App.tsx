import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type Direction } from "./api";
import AuthPanel from "./AuthPanel";
import History from "./History";

const TOKEN_KEY = "b64.token";
const USER_KEY = "b64.username";

export default function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [username, setUsername] = useState<string | null>(() => localStorage.getItem(USER_KEY));

  const [plain, setPlain] = useState("");
  const [encoded, setEncoded] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Direction | null>(null);
  const [saveToHistory, setSaveToHistory] = useState(false);
  const [copied, setCopied] = useState<"plain" | "encoded" | null>(null);
  const [lastSaved, setLastSaved] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);

  const signIn = (newToken: string, name: string) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    localStorage.setItem(USER_KEY, name);
    setToken(newToken);
    setUsername(name);
  };

  const clearSession = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUsername(null);
    setSaveToHistory(false);
  }, []);

  const signOut = async () => {
    const current = token;
    clearSession();
    if (current) {
      try {
        await api.logout(current);
      } catch {
        return;
      }
    }
  };

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    api
      .me(token)
      .then((me) => {
        if (cancelled) return;
        setUsername(me.username);
        localStorage.setItem(USER_KEY, me.username);
      })
      .catch((err) => {
        if (!cancelled && err instanceof ApiError && err.status === 401) clearSession();
      });
    return () => {
      cancelled = true;
    };
  }, [token, clearSession]);

  const run = async (direction: Direction) => {
    setError(null);
    setLastSaved(false);
    setBusy(direction);
    const input = direction === "encode" ? plain : encoded;
    try {
      let output: string;
      if (token && saveToHistory) {
        const saved = await api.saveConversion(token, direction, input);
        output = saved.output;
        setLastSaved(true);
        setHistoryKey((k) => k + 1);
      } else if (direction === "encode") {
        output = (await api.encode(input)).encoded;
      } else {
        output = (await api.decode(input)).text;
      }
      if (direction === "encode") setEncoded(output);
      else setPlain(output);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearSession();
        setError("Your session has expired. Please sign in again.");
      } else {
        setError(err instanceof ApiError ? err.message : "Something went wrong");
      }
    } finally {
      setBusy(null);
    }
  };

  const copy = async (which: "plain" | "encoded") => {
    const value = which === "plain" ? plain : encoded;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const area = document.createElement("textarea");
        area.value = value;
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        area.remove();
      }
      setCopied(which);
      window.setTimeout(() => setCopied((c) => (c === which ? null : c)), 1500);
    } catch {
      setError("Could not copy to clipboard");
    }
  };

  const signedIn = Boolean(token);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <h1 className="text-xl font-bold tracking-tight">
            Base64 <span className="text-indigo-600">Converter</span>
          </h1>
          {signedIn && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-600">
                Signed in as <strong data-testid="current-username" className="text-slate-900">{username}</strong>
              </span>
              <button
                type="button"
                onClick={() => void signOut()}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-6 px-4 py-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col">
                <div className="mb-1 flex items-center justify-between">
                  <label htmlFor="plain-text" className="text-sm font-medium text-slate-700">
                    Text (UTF-8)
                  </label>
                  <button
                    type="button"
                    onClick={() => void copy("plain")}
                    className="rounded px-2 py-0.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50"
                  >
                    {copied === "plain" ? "Copied!" : "Copy"}
                  </button>
                </div>
                <textarea
                  id="plain-text"
                  value={plain}
                  onChange={(e) => setPlain(e.target.value)}
                  rows={10}
                  spellCheck={false}
                  placeholder="Type text to encode…"
                  className="w-full flex-1 resize-y rounded-md border border-slate-300 p-3 font-mono text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:outline-none"
                />
              </div>
              <div className="flex flex-col">
                <div className="mb-1 flex items-center justify-between">
                  <label htmlFor="base64-text" className="text-sm font-medium text-slate-700">
                    Base64
                  </label>
                  <button
                    type="button"
                    onClick={() => void copy("encoded")}
                    className="rounded px-2 py-0.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50"
                  >
                    {copied === "encoded" ? "Copied!" : "Copy"}
                  </button>
                </div>
                <textarea
                  id="base64-text"
                  value={encoded}
                  onChange={(e) => setEncoded(e.target.value)}
                  rows={10}
                  spellCheck={false}
                  placeholder="Paste base64 to decode…"
                  className="w-full flex-1 resize-y rounded-md border border-slate-300 p-3 font-mono text-sm break-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void run("encode")}
                disabled={busy !== null}
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {busy === "encode" ? "Encoding…" : "Encode"}
              </button>
              <button
                type="button"
                onClick={() => void run("decode")}
                disabled={busy !== null}
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {busy === "decode" ? "Decoding…" : "Decode"}
              </button>

              {signedIn && (
                <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={saveToHistory}
                    aria-label="Save to history"
                    onClick={() => setSaveToHistory((v) => !v)}
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${
                      saveToHistory ? "bg-indigo-600" : "bg-slate-300"
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                        saveToHistory ? "translate-x-5" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                  Save to history
                </label>
              )}
            </div>

            {error && (
              <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}
            {lastSaved && !error && (
              <p className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">Saved to history.</p>
            )}
          </section>

          {signedIn && token && <History token={token} refreshKey={historyKey} onUnauthorized={clearSession} />}
        </div>

        <aside>
          {signedIn ? (
            <section className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
              <p>
                Turn on <strong>Save to history</strong> to keep your conversions. Your history is private to your
                account.
              </p>
            </section>
          ) : (
            <div className="space-y-3">
              <AuthPanel onSignedIn={signIn} />
              <p className="px-1 text-xs text-slate-500">
                Converting works without an account. Sign in to save conversions to your private history.
              </p>
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}

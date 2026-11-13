import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, type CheckResult } from "./api";
import AuthPanel from "./AuthPanel";
import History from "./History";

type Session = { token: string; username: string };
const STORAGE_KEY = "xml-checker-session";

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export default function App() {
  const [session, setSession] = useState<Session | null>(loadSession);
  const [xml, setXml] = useState("");
  const [result, setResult] = useState<CheckResult | null>(null);
  const [checkedXml, setCheckedXml] = useState("");
  const [save, setSave] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);

  const clearSession = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setSession(null);
  }, []);

  useEffect(() => {
    if (!session) return;
    api.me(session.token).catch((e) => {
      if (e instanceof ApiError && e.status === 401) clearSession();
    });
  }, [session, clearSession]);

  function onLogin(token: string, username: string) {
    const s = { token, username };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    setSession(s);
  }

  async function signOut() {
    if (session) await api.logout(session.token).catch(() => undefined);
    clearSession();
    setSave(false);
  }

  async function check() {
    setBusy(true);
    setError(null);
    try {
      let res: CheckResult;
      if (session && save) {
        res = await api.save(session.token, xml);
        setRefreshKey((k) => k + 1);
      } else {
        res = await api.check(xml);
      }
      setResult(res);
      setCheckedXml(xml);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) clearSession();
      setError(e instanceof ApiError ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  async function loadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setXml(await file.text());
    setResult(null);
    e.target.value = "";
  }

  const lines = checkedXml.split(/\r\n|\r|\n/);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="bg-white shadow">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <h1 className="text-xl font-bold">XML well-formedness checker</h1>
          {session ? (
            <div className="flex items-center gap-3 text-sm">
              <span>
                Signed in as <strong data-testid="username">{session.username}</strong>
              </span>
              <button
                className="rounded bg-slate-200 px-3 py-1 hover:bg-slate-300"
                onClick={() => void signOut()}
              >
                Sign out
              </button>
            </div>
          ) : (
            <AuthPanel onLogin={onLogin} />
          )}
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-6">
        <section className="rounded-lg bg-white p-4 shadow">
          <div className="mb-2 flex items-center justify-between">
            <label htmlFor="xml" className="font-semibold">
              XML document
            </label>
            <div>
              <input
                ref={fileInput}
                type="file"
                accept=".xml,text/xml,application/xml,text/plain"
                className="hidden"
                aria-label="Load file"
                onChange={(e) => void loadFile(e)}
              />
              <button
                className="rounded bg-slate-200 px-3 py-1 text-sm hover:bg-slate-300"
                onClick={() => fileInput.current?.click()}
              >
                Load file
              </button>
            </div>
          </div>
          <textarea
            id="xml"
            className="h-56 w-full rounded border border-slate-300 p-2 font-mono text-sm focus:border-indigo-500 focus:outline-none"
            value={xml}
            onChange={(e) => setXml(e.target.value)}
            spellCheck={false}
          />
          <div className="mt-3 flex items-center gap-4">
            <button
              className="rounded bg-indigo-600 px-5 py-2 font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              onClick={() => void check()}
              disabled={busy}
            >
              Check
            </button>
            {session && (
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  role="switch"
                  className="peer sr-only"
                  checked={save}
                  onChange={(e) => setSave(e.target.checked)}
                />
                <span className="relative h-5 w-9 rounded-full bg-slate-300 transition peer-checked:bg-indigo-600 peer-focus-visible:ring-2 after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-4" />
                Save
              </label>
            )}
          </div>
          {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
        </section>

        {result && (
          <section className="rounded-lg bg-white p-4 shadow" aria-label="Result">
            {result.valid ? (
              <div className="flex items-center gap-3">
                <span className="rounded-full bg-green-600 px-3 py-1 text-sm font-semibold text-white">
                  Well-formed
                </span>
                <span className="text-sm">
                  Root element: <code className="font-mono">{result.root_element}</code>
                </span>
              </div>
            ) : (
              <div>
                <p className="font-semibold text-red-700" role="alert">
                  {result.error}
                  <span className="ml-2 font-normal">
                    (line {result.line}, column {result.column})
                  </span>
                </p>
                <pre className="mt-3 max-h-64 overflow-auto rounded border border-slate-200 bg-slate-50 py-1 font-mono text-sm">
                  {lines.map((text, i) => {
                    const bad = i + 1 === result.line;
                    return (
                      <div
                        key={i}
                        data-error-line={bad ? "true" : undefined}
                        className={`flex px-2 ${bad ? "bg-red-100 text-red-900" : ""}`}
                      >
                        <span className="mr-3 w-8 shrink-0 select-none text-right text-slate-400">
                          {i + 1}
                        </span>
                        <span className="whitespace-pre-wrap break-all">{text || " "}</span>
                      </div>
                    );
                  })}
                </pre>
              </div>
            )}
          </section>
        )}

        {session && (
          <History token={session.token} refreshKey={refreshKey} onExpired={clearSession} />
        )}
      </main>
    </div>
  );
}

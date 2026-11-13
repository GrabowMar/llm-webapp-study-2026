import { useEffect, useState } from "react";
import { api, ApiError, getToken, setToken } from "./api";
import AuthPanel from "./AuthPanel";
import History from "./History";

const area =
  "h-48 w-full resize-y rounded-md border border-slate-300 p-3 font-mono text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

export default function App() {
  const [username, setUsername] = useState<string | null>(null);
  const [checking, setChecking] = useState(getToken() !== null);
  const [plain, setPlain] = useState("");
  const [encoded, setEncoded] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [save, setSave] = useState(false);
  const [copied, setCopied] = useState<"plain" | "encoded" | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  async function loadUser() {
    if (!getToken()) {
      setUsername(null);
      setChecking(false);
      return;
    }
    try {
      setUsername((await api.me()).username);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setToken(null);
      setUsername(null);
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    loadUser();
  }, []);

  async function signOut() {
    try {
      await api.logout();
    } catch {
      /* token may already be invalid */
    }
    setToken(null);
    setUsername(null);
    setSave(false);
  }

  async function run(direction: "encode" | "decode") {
    setError(null);
    const input = direction === "encode" ? plain : encoded;
    try {
      let output: string;
      if (username && save) {
        output = (await api.save(direction, input)).output;
        setRefreshKey((k) => k + 1);
      } else if (direction === "encode") {
        output = (await api.encode(input)).encoded;
      } else {
        output = (await api.decode(input)).text;
      }
      if (direction === "encode") setEncoded(output);
      else setPlain(output);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setToken(null);
        setUsername(null);
      }
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  async function copy(which: "plain" | "encoded") {
    try {
      await navigator.clipboard.writeText(which === "plain" ? plain : encoded);
      setCopied(which);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setError("Could not copy to clipboard");
    }
  }

  const btn = "rounded-md px-4 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <h1 className="text-xl font-semibold">Base64 converter</h1>
          {username && (
            <div className="flex items-center gap-3 text-sm">
              <span>
                Signed in as <strong>{username}</strong>
              </span>
              <button onClick={signOut} className={`${btn} border border-slate-300 hover:bg-slate-100`}>
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-6">
        {!checking && !username && <AuthPanel onSignedIn={loadUser} />}

        <section className="space-y-4 rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label htmlFor="plain" className="text-sm font-medium text-slate-600">
                  Text
                </label>
                <button
                  onClick={() => copy("plain")}
                  className="rounded px-2 py-0.5 text-xs text-indigo-600 hover:bg-indigo-50"
                >
                  {copied === "plain" ? "Copied" : "Copy"}
                </button>
              </div>
              <textarea id="plain" className={area} value={plain} onChange={(e) => setPlain(e.target.value)} />
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label htmlFor="encoded" className="text-sm font-medium text-slate-600">
                  Base64
                </label>
                <button
                  onClick={() => copy("encoded")}
                  className="rounded px-2 py-0.5 text-xs text-indigo-600 hover:bg-indigo-50"
                >
                  {copied === "encoded" ? "Copied" : "Copy"}
                </button>
              </div>
              <textarea
                id="encoded"
                className={area}
                value={encoded}
                onChange={(e) => setEncoded(e.target.value)}
              />
            </div>
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={() => run("encode")} className={`${btn} bg-indigo-600 text-white hover:bg-indigo-700`}>
              Encode
            </button>
            <button onClick={() => run("decode")} className={`${btn} bg-slate-800 text-white hover:bg-slate-900`}>
              Decode
            </button>
            {username && (
              <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  role="switch"
                  checked={save}
                  onChange={(e) => setSave(e.target.checked)}
                  className="peer sr-only"
                />
                <span className="relative h-5 w-9 rounded-full bg-slate-300 transition peer-checked:bg-indigo-600 peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-500 after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-4" />
                Save to history
              </label>
            )}
          </div>
        </section>

        {username && <History refreshKey={refreshKey} />}
      </main>
    </div>
  );
}

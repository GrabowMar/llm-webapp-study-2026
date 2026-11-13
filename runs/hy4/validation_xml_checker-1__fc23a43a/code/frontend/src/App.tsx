import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { api, type SavedCheck, type ValidationPage, type ValidationResult } from "./api";

const PAGE_SIZE = 10;

type Filter = "all" | "valid" | "invalid";

function AuthPanel({
  token,
  username,
  onAuth,
  onLogout,
}: {
  token: string | null;
  username: string | null;
  onAuth: (token: string, username: string) => void;
  onLogout: () => void;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "register") {
        await api(`/auth/register`, {
          method: "POST",
          body: JSON.stringify({ username: name, password }),
        });
      }
      const data = await api<{ token: string }>(`/auth/login`, {
        method: "POST",
        body: JSON.stringify({ username: name, password }),
      });
      onAuth(data.token, name.trim());
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await api("/auth/logout", { method: "POST" }, token).catch(() => undefined);
    onLogout();
  }

  if (token) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm text-slate-600">
          Signed in as <span className="font-semibold text-slate-900">{username}</span>
        </span>
        <button
          type="button"
          onClick={logout}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
      <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
        {(["login", "register"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setError("");
            }}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              mode === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {m === "login" ? "Sign in" : "Register"}
          </button>
        ))}
      </div>
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
        Username
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoComplete="username"
          className="w-36 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
        Password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          className="w-36 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
        />
      </label>
      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {busy ? "..." : mode === "login" ? "Sign in" : "Create account"}
      </button>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </form>
  );
}

function lineClass(isError: boolean): string {
  return `flex w-full text-left font-mono text-sm ${
    isError ? "bg-red-100 text-red-900 ring-1 ring-inset ring-red-300" : "text-slate-700"
  }`;
}

function XmlLines({ text, errorLine }: { text: string; errorLine: number | null }) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  return (
    <div className="max-h-80 overflow-auto rounded-lg border border-slate-200 bg-slate-50 py-2">
      {lines.map((line, index) => (
        <div key={index} className={lineClass(errorLine === index + 1)}>
          <span className="w-12 shrink-0 select-none pr-3 text-right text-slate-400">
            {index + 1}
          </span>
          <span className="whitespace-pre-wrap break-all pr-3">{line || " "}</span>
        </div>
      ))}
    </div>
  );
}

function History({
  token,
  refreshKey,
}: {
  token: string;
  refreshKey: number;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ValidationPage | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  const load = useCallback(async () => {
    const query = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
    if (filter !== "all") query.set("valid", filter === "valid" ? "true" : "false");
    try {
      const result = await api<ValidationPage>(`/validations?${query}`, {}, token);
      setData(result);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load history");
    }
  }, [token, page, filter]);

  useEffect(() => {
    void load();
  }, [load, refreshKey, reload]);

  useEffect(() => {
    setPage(1);
  }, [filter]);

  async function remove(id: number) {
    try {
      await api(`/validations/${id}`, { method: "DELETE" }, token);
      setReload((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete check");
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">Saved checks</h2>
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
          {(["all", "valid", "invalid"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize ${
                filter === f ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      {!data || data.items.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">No saved checks yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {data.items.map((item) => (
            <li key={item.id} className="flex items-start gap-3 py-3">
              <span
                className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                  item.valid
                    ? "bg-green-100 text-green-800"
                    : "bg-red-100 text-red-800"
                }`}
              >
                {item.valid ? "Valid" : "Invalid"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-xs text-slate-600">
                  {item.xml_preview || "(empty document)"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {item.valid
                    ? `Root: ${item.root_element ?? "—"}`
                    : `${item.error ?? "Error"} (line ${item.line}, column ${item.column})`}
                  {" · "}
                  {new Date(item.created_at).toLocaleString()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void remove(item.id)}
                className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
        <span>{data ? `${data.total} check${data.total === 1 ? "" : "s"}` : "—"}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-lg border border-slate-300 px-3 py-1 disabled:opacity-40"
          >
            Previous
          </button>
          <span>
            Page {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg border border-slate-300 px-3 py-1 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}

export default function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("token"));
  const [username, setUsername] = useState<string | null>(() => localStorage.getItem("username"));
  const [xml, setXml] = useState("<root>\n  <child>Hello</child>\n</root>");
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [checkError, setCheckError] = useState("");
  const [busy, setBusy] = useState(false);
  const [save, setSave] = useState(true);
  const [historyKey, setHistoryKey] = useState(0);
  const [notice, setNotice] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!token) return;
    api<{ username: string }>("/auth/me", {}, token)
      .then((data) => {
        setUsername(data.username);
        localStorage.setItem("username", data.username);
      })
      .catch(() => {
        setToken(null);
        setUsername(null);
        localStorage.removeItem("token");
        localStorage.removeItem("username");
      });
  }, [token]);

  function onAuth(newToken: string, name: string) {
    localStorage.setItem("token", newToken);
    localStorage.setItem("username", name);
    setToken(newToken);
    setUsername(name);
    setHistoryKey((n) => n + 1);
  }

  function onLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    setToken(null);
    setUsername(null);
    setResult(null);
  }

  async function loadFile(file: File | undefined) {
    if (!file) return;
    setXml(await file.text());
    setResult(null);
    setNotice("");
    if (fileRef.current) fileRef.current.value = "";
  }

  async function check() {
    setBusy(true);
    setCheckError("");
    setNotice("");
    setResult(null);
    try {
      const saveResult = Boolean(token && save);
      const data = await api<ValidationResult>(
        saveResult ? "/validations" : "/validate/xml",
        { method: "POST", body: JSON.stringify({ xml }) },
        saveResult ? token : null,
      );
      setResult(data);
      if (saveResult) {
        setHistoryKey((n) => n + 1);
        setNotice("Saved to your history.");
      }
    } catch (err) {
      setCheckError(err instanceof Error ? err.message : "Could not check document");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight">XML Checker</h1>
            <p className="text-xs text-slate-500">Syntax-only well-formedness validation</p>
          </div>
          <AuthPanel token={token} username={username} onAuth={onAuth} onLogout={onLogout} />
        </div>
      </header>

      <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-8">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Check a document</h2>
            <label className="cursor-pointer rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100">
              Load file
              <input
                ref={fileRef}
                type="file"
                accept=".xml,.txt,text/xml,application/xml,text/plain"
                className="hidden"
                onChange={(e) => void loadFile(e.target.files?.[0])}
              />
            </label>
          </div>
          <textarea
            value={xml}
            onChange={(e) => {
              setXml(e.target.value);
              setResult(null);
              setNotice("");
            }}
            spellCheck={false}
            rows={8}
            className="w-full resize-y rounded-lg border border-slate-300 bg-slate-50 p-3 font-mono text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            placeholder="Paste XML here..."
          />
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => void check()}
              disabled={busy}
              className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {busy ? "Checking..." : "Check"}
            </button>
            {token && (
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={save}
                  onChange={(e) => setSave(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 accent-indigo-600"
                />
                Save to history
              </label>
            )}
            {notice && <span className="text-sm text-green-700">{notice}</span>}
          </div>
          {checkError && <p className="mt-3 text-sm text-red-600">{checkError}</p>}
        </section>

        {result && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold">Result</h2>
            {result.valid ? (
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-800">
                  <span className="h-2 w-2 rounded-full bg-green-500" />
                  Well-formed
                </span>
                <span className="text-sm text-slate-600">
                  Root element: <code className="font-mono font-semibold">{result.root_element}</code>
                </span>
              </div>
            ) : (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                <p className="font-semibold">Not well-formed: {result.error}</p>
                <p className="mt-1">
                  At line {result.line}, column {result.column}
                </p>
              </div>
            )}
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              Document lines
            </p>
            <XmlLines text={xml} errorLine={result.valid ? null : result.line} />
          </section>
        )}

        {token && <History token={token} refreshKey={historyKey} />}
      </main>
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type Conversion, type Direction } from "./api";

const PAGE_SIZE = 5;

function message(err: unknown): string {
  return err instanceof ApiError || err instanceof Error
    ? err.message
    : "Something went wrong.";
}

function AuthPanel({
  token,
  username,
  onAuth,
  onSignOut,
}: {
  token: string | null;
  username: string | null;
  onAuth: (token: string, username: string) => void;
  onSignOut: () => void;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "register") {
        await api.register(name, password);
        const { token } = await api.login(name, password);
        onAuth(token, name.trim());
      } else {
        const { token } = await api.login(name, password);
        onAuth(token, name.trim());
      }
      setPassword("");
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  if (token) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <span className="text-sm text-slate-500">Signed in as</span>
        <span className="font-semibold text-slate-800" data-testid="username">
          {username}
        </span>
        <button
          onClick={onSignOut}
          className="ml-auto rounded-md bg-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-300"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="mb-4 flex gap-1 rounded-md bg-slate-100 p-1">
        {(["login", "register"] as const).map((m) => (
          <button
            type="button"
            key={m}
            onClick={() => {
              setMode(m);
              setError("");
            }}
            className={`flex-1 rounded px-3 py-1.5 text-sm font-medium transition ${
              mode === m
                ? "bg-white text-slate-900 shadow"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {m === "login" ? "Sign in" : "Register"}
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-600">Username</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="username"
            className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            placeholder="username"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-600">Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            placeholder="password"
          />
        </label>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm font-medium text-red-600">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="mt-4 w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
      >
        {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
      </button>
      <p className="mt-2 text-center text-xs text-slate-400">
        Sign in to save conversions to your private history.
      </p>
    </form>
  );
}

function Converter({
  token,
  onSaved,
}: {
  token: string | null;
  onSaved: () => void;
}) {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [save, setSave] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<Direction | null>(null);

  useEffect(() => {
    if (!token) setSave(false);
  }, [token]);

  async function run(direction: Direction) {
    setError("");
    setCopied(false);
    setBusy(direction);
    try {
      if (save && token) {
        const result = await api.saveConversion(direction, input, token);
        setOutput(result.output ?? "");
        onSaved();
      } else if (direction === "encode") {
        setOutput((await api.encode(input)).encoded);
      } else {
        setOutput((await api.decode(input)).text);
      }
    } catch (err) {
      setError(message(err));
      setOutput("");
    } finally {
      setBusy(null);
    }
  }

  async function copy() {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Could not copy to clipboard.");
    }
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-slate-800">Convert</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col text-sm">
          <span className="mb-1 font-medium text-slate-600">
            Input (plain text or base64)
          </span>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={8}
            data-testid="input"
            className="w-full resize-y rounded-md border border-slate-300 p-3 font-mono text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            placeholder="Type text to encode, or base64 to decode…"
          />
        </label>
        <label className="flex flex-col text-sm">
          <span className="mb-1 font-medium text-slate-600">Output</span>
          <textarea
            value={output}
            readOnly
            rows={8}
            data-testid="output"
            className="w-full resize-y rounded-md border border-slate-300 bg-slate-50 p-3 font-mono text-sm outline-none"
            placeholder="Result appears here…"
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={() => run("encode")}
          disabled={busy !== null}
          className="rounded-md bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          Encode
        </button>
        <button
          onClick={() => run("decode")}
          disabled={busy !== null}
          className="rounded-md bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          Decode
        </button>
        <button
          onClick={copy}
          disabled={!output}
          data-testid="copy"
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
        >
          {copied ? "Copied!" : "Copy"}
        </button>

        {token && (
          <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={save}
              onChange={(e) => setSave(e.target.checked)}
              data-testid="save-switch"
              className="h-4 w-4 accent-indigo-600"
            />
            Save to history
          </label>
        )}
      </div>

      {error && (
        <p
          role="alert"
          data-testid="converter-error"
          className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-700"
        >
          {error}
        </p>
      )}
    </section>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function History({
  token,
  refreshKey,
}: {
  token: string;
  refreshKey: number;
}) {
  const [items, setItems] = useState<Conversion[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api.list(token, page, PAGE_SIZE);
      setItems(result.items);
      setTotal(result.total);
      setPageSize(result.page_size);
    } catch (err) {
      setError(message(err));
    } finally {
      setLoading(false);
    }
  }, [token, page]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  async function remove(id: number) {
    setError("");
    try {
      await api.remove(token, id);
      await load();
    } catch (err) {
      setError(message(err));
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function goTo(next: number) {
    setPage(Math.min(Math.max(1, next), totalPages));
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800">History</h2>
        <span className="text-sm text-slate-400">{total} saved</span>
      </div>

      {error && (
        <p role="alert" className="mb-3 text-sm font-medium text-red-600">
          {error}
        </p>
      )}

      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">
          {loading ? "Loading…" : "No saved conversions yet."}
        </p>
      ) : (
        <ul className="divide-y divide-slate-100" data-testid="history-list">
          {items.map((item) => (
            <li key={item.id} className="flex items-start gap-3 py-3">
              <span
                className={`mt-0.5 shrink-0 rounded px-2 py-0.5 text-xs font-semibold uppercase ${
                  item.direction === "encode"
                    ? "bg-indigo-100 text-indigo-700"
                    : "bg-emerald-100 text-emerald-700"
                }`}
              >
                {item.direction}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-sm text-slate-700">
                  {item.input_preview || "(empty)"}
                </p>
                <p className="truncate font-mono text-sm text-slate-500">
                  → {item.output_preview || "(empty)"}
                </p>
                <p className="mt-0.5 text-xs text-slate-400">
                  {formatDate(item.created_at)}
                </p>
              </div>
              <button
                onClick={() => remove(item.id)}
                aria-label={`Delete conversion ${item.id}`}
                className="shrink-0 rounded-md px-2 py-1 text-sm text-red-500 hover:bg-red-50 hover:text-red-700"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
        <button
          onClick={() => goTo(page - 1)}
          disabled={page <= 1 || loading}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40"
        >
          Previous
        </button>
        <span className="text-sm text-slate-500">
          Page {page} of {totalPages}
        </span>
        <button
          onClick={() => goTo(page + 1)}
          disabled={page >= totalPages || loading}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </section>
  );
}

const TOKEN_KEY = "b64_token";
const USER_KEY = "b64_username";

export default function App() {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem(TOKEN_KEY),
  );
  const [username, setUsername] = useState<string | null>(() =>
    localStorage.getItem(USER_KEY),
  );
  const [refreshKey, setRefreshKey] = useState(0);

  function onAuth(newToken: string, name: string) {
    localStorage.setItem(TOKEN_KEY, newToken);
    localStorage.setItem(USER_KEY, name);
    setToken(newToken);
    setUsername(name);
    setRefreshKey((k) => k + 1);
  }

  function onSignOut() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUsername(null);
  }

  return (
    <div className="min-h-screen bg-slate-100 py-8">
      <div className="mx-auto max-w-4xl px-4">
        <header className="mb-6">
          <h1 className="text-3xl font-bold text-slate-900">Base64 Converter</h1>
          <p className="mt-1 text-sm text-slate-500">
            Encode UTF-8 text to standard base64 and decode it back.
          </p>
        </header>

        <div className="space-y-6">
          <AuthPanel
            token={token}
            username={username}
            onAuth={onAuth}
            onSignOut={onSignOut}
          />
          <Converter
            token={token}
            onSaved={() => setRefreshKey((k) => k + 1)}
          />
          {token && <History token={token} refreshKey={refreshKey} />}
        </div>
      </div>
    </div>
  );
}

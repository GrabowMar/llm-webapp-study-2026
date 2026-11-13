import { useCallback, useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";

type Account = { username: string; balance: number };
type Transfer = {
  id: number;
  to_username: string;
  from_username: string;
  amount: number;
  memo: string;
  created_at: string;
  direction: "in" | "out";
};
type Page<T> = { items: T[]; total: number; page: number; page_size: number };
type ApiError = { error?: string; message?: string; code?: string };

const TOKEN_KEY = "bank.token";
const PAGE_SIZE = 8;

async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; token?: string | null; csrf?: string | null } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.token) headers["Authorization"] = `Bearer ${options.token}`;
  if (options.csrf) headers["X-CSRF-Token"] = options.csrf;
  const response = await fetch(path, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
      if (!response.ok) {
        const detail = (payload ?? {}) as ApiError;
        const err = new Error(detail.message ?? detail.error ?? `Request failed (${response.status})`);
        (err as Error & { status?: number; code?: string }).status = response.status;
        (err as Error & { code?: string }).code = detail.code;
        if (response.status === 401 && options.token) {
          localStorage.removeItem(TOKEN_KEY);
          window.dispatchEvent(new Event("bank:unauthorized"));
        }
        throw err;
      }
  return payload as T;
}

const money = (value: number) =>
  value.toLocaleString(undefined, { style: "currency", currency: "USD", minimumFractionDigits: 2 });

const dateLabel = (value: string) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
};

const errMessage = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 disabled:bg-slate-100";

const primaryBtn =
  "inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

const secondaryBtn =
  "inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-50";

function Notice({ kind, children }: { kind: "error" | "success" | "info"; children: ReactNode }) {
  const styles =
    kind === "error"
      ? "border-red-200 bg-red-50 text-red-700"
      : kind === "success"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : "border-indigo-200 bg-indigo-50 text-indigo-700";
  return (
    <div role="status" className={`rounded-lg border px-3.5 py-2.5 text-sm ${styles}`}>
      {children}
    </div>
  );
}

function AuthScreen({ onSignedIn }: { onSignedIn: (token: string) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setInfo("");
    try {
      const csrf = await api<{ csrf_token: string }>("/api/auth/csrf");
      if (mode === "register") {
        await api("/api/auth/register", {
          method: "POST",
          body: { username, password },
          csrf: csrf.csrf_token,
        });
        setInfo("Account created. You can sign in now.");
        setMode("login");
        setPassword("");
      } else {
        const result = await api<{ token: string }>("/api/auth/login", {
          method: "POST",
          body: { username, password },
          csrf: csrf.csrf_token,
        });
        onSignedIn(result.token);
      }
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-50 via-slate-50 to-sky-50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 text-2xl font-bold text-white shadow-lg shadow-indigo-200">
            B
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Northbank</h1>
          <p className="mt-1 text-sm text-slate-500">Simple, secure money transfers.</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200/60">
          <div className="mb-6 flex rounded-lg bg-slate-100 p-1">
            {(["login", "register"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => {
                  setMode(tab);
                  setError("");
                  setInfo("");
                }}
                className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold transition ${
                  mode === tab ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {tab === "login" ? "Sign in" : "Register"}
              </button>
            ))}
          </div>
          <form onSubmit={submit} className="space-y-4">
            <Field label="Username">
              <input
                className={inputClass}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="your username"
                autoComplete="username"
                required
                maxLength={64}
              />
            </Field>
            <Field label="Password">
              <input
                className={inputClass}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
              />
            </Field>
            {error && <Notice kind="error">{error}</Notice>}
            {info && <Notice kind="success">{info}</Notice>}
            <button className={`${primaryBtn} w-full`} type="submit" disabled={busy}>
              {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
            </button>
          </form>
        </div>
        <p className="mt-6 text-center text-xs text-slate-400">
          Every new account starts with {money(1000)} to spend.
        </p>
      </div>
    </div>
  );
}

type Draft = { to_username: string; amount: string; memo: string };

function TransferForm({
  token,
  onCompleted,
}: {
  token: string;
  onCompleted: () => void;
}) {
  const [draft, setDraft] = useState<Draft>({ to_username: "", amount: "", memo: "" });
  const [stage, setStage] = useState<"editing" | "confirming" | "done">("editing");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [csrf, setCsrf] = useState("");

  useEffect(() => {
    api<{ csrf_token: string }>("/api/auth/csrf", { token })
      .then((r) => setCsrf(r.csrf_token))
      .catch(() => setCsrf(""));
  }, [token]);

  const payload = () => ({
    to_username: draft.to_username.trim(),
    amount: Number(draft.amount),
    memo: draft.memo,
  });

  const review = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const result = await api<{ message: string }>("/api/transfers", {
        method: "POST",
        body: { ...payload(), dry_run: true },
        token,
        csrf,
      });
      setMessage(result.message);
      setStage("confirming");
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setError("");
    setBusy(true);
    try {
      await api<Transfer>("/api/transfers", {
        method: "POST",
        body: payload(),
        token,
        csrf,
      });
      setStage("done");
      setMessage("Transfer sent successfully.");
      setDraft({ to_username: "", amount: "", memo: "" });
      onCompleted();
    } catch (e) {
      setError(errMessage(e));
      setStage("editing");
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setStage("editing");
    setError("");
    setMessage("");
  };

  if (stage === "confirming") {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Confirm transfer</h2>
        <p className="mt-1 text-sm text-slate-500">Please review the details before sending.</p>
        <dl className="mt-5 space-y-3 rounded-xl bg-slate-50 p-4 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">To</dt>
            <dd className="font-semibold text-slate-900">{draft.to_username.trim()}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Amount</dt>
            <dd className="font-semibold text-slate-900">{money(Number(draft.amount))}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Memo</dt>
            <dd className="max-w-[60%] break-words text-right font-medium text-slate-800">
              {draft.memo || "—"}
            </dd>
          </div>
        </dl>
        {message && <div className="mt-4"><Notice kind="info">{message}</Notice></div>}
        {error && <div className="mt-4"><Notice kind="error">{error}</Notice></div>}
        <div className="mt-5 flex gap-3">
          <button className={`${primaryBtn} flex-1`} type="button" onClick={confirm} disabled={busy}>
            {busy ? "Sending…" : "Confirm & send"}
          </button>
          <button className={secondaryBtn} type="button" onClick={reset} disabled={busy}>
            Edit
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Send money</h2>
      <p className="mt-1 text-sm text-slate-500">Transfer funds to another user by username.</p>
      <form onSubmit={review} className="mt-5 space-y-4">
        <Field label="Recipient username">
          <input
            className={inputClass}
            value={draft.to_username}
            onChange={(e) => setDraft({ ...draft, to_username: e.target.value })}
            placeholder="e.g. jane"
            required
          />
        </Field>
        <Field label="Amount">
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-slate-400">$</span>
            <input
              className={`${inputClass} pl-7`}
              type="number"
              min="0.01"
              step="0.01"
              value={draft.amount}
              onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
              placeholder="0.00"
              required
            />
          </div>
        </Field>
        <Field label="Memo (optional)">
          <input
            className={inputClass}
            value={draft.memo}
            onChange={(e) => setDraft({ ...draft, memo: e.target.value })}
            placeholder="What's it for?"
            maxLength={500}
          />
        </Field>
        {error && <Notice kind="error">{error}</Notice>}
        {stage === "done" && message && <Notice kind="success">{message}</Notice>}
        <button className={`${primaryBtn} w-full`} type="submit" disabled={busy}>
          {busy ? "Checking…" : "Continue"}
        </button>
      </form>
    </section>
  );
}

function History({ token, refreshKey }: { token: string; refreshKey: number }) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<Transfer> | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api<Page<Transfer>>(
        `/api/transfers?page=${page}&page_size=${PAGE_SIZE}`,
        { token },
      );
      setData(result);
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setLoading(false);
    }
  }, [page, token]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  useEffect(() => {
    setPage(1);
  }, [refreshKey]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Transaction history</h2>
          <p className="text-sm text-slate-500">
            {data ? `${data.total} transfer${data.total === 1 ? "" : "s"}` : "Transfers you sent or received"}
          </p>
        </div>
        <button className={secondaryBtn} type="button" onClick={() => void load()} disabled={loading}>
          Refresh
        </button>
      </div>

      {loading && !data && <p className="px-6 py-10 text-center text-sm text-slate-500">Loading…</p>}
      {error && <div className="p-6"><Notice kind="error">{error}</Notice></div>}
      {data && data.items.length === 0 && (
        <p className="px-6 py-12 text-center text-sm text-slate-500">
          No transfers yet. Send your first one above.
        </p>
      )}
      {data && data.items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-6 py-3 font-semibold">Direction</th>
                <th className="px-6 py-3 font-semibold">Other party</th>
                <th className="px-6 py-3 font-semibold">Amount</th>
                <th className="px-6 py-3 font-semibold">Memo</th>
                <th className="px-6 py-3 font-semibold">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((t) => {
                const incoming = t.direction === "in";
                const other = incoming ? t.from_username : t.to_username;
                return (
                  <tr key={t.id} className="hover:bg-slate-50/70">
                    <td className="px-6 py-3.5">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                          incoming
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {incoming ? "↓ In" : "↑ Out"}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 font-medium text-slate-800">{other}</td>
                    <td
                      className={`px-6 py-3.5 font-semibold tabular-nums ${
                        incoming ? "text-emerald-600" : "text-slate-900"
                      }`}
                    >
                      {incoming ? "+" : "−"}
                      {money(t.amount)}
                    </td>
                    <td className="max-w-xs px-6 py-3.5 text-slate-500">
                      <span className="block truncate" title={t.memo}>
                        {t.memo || "—"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-3.5 text-slate-500">
                      {dateLabel(t.created_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {data && totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4">
          <span className="text-xs text-slate-500">
            Page {data.page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              className={secondaryBtn}
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </button>
            <button
              className={secondaryBtn}
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function Dashboard({ token, onSignOut }: { token: string; onSignOut: () => void }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState("");

  const loadAccount = useCallback(async () => {
    try {
      setAccount(await api<Account>("/api/account", { token }));
      setError("");
    } catch (e) {
      setError(errMessage(e));
    }
  }, [token]);

  useEffect(() => {
    void loadAccount();
  }, [loadAccount, refreshKey]);

  const refresh = () => setRefreshKey((k) => k + 1);

  const signOut = async () => {
    try {
      await api("/api/auth/logout", { method: "POST", token });
    } catch {
      /* still sign out locally */
    }
    onSignOut();
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-lg font-bold text-white">
              B
            </div>
            <span className="text-lg font-bold tracking-tight text-slate-900">Northbank</span>
          </div>
          <div className="flex items-center gap-3">
            {account && (
              <span className="hidden text-sm text-slate-500 sm:inline">
                Signed in as <span className="font-semibold text-slate-800">{account.username}</span>
              </span>
            )}
            <button className={secondaryBtn} type="button" onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
        {error && <Notice kind="error">{error}</Notice>}
        <section className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 p-7 text-white shadow-lg shadow-indigo-200">
          <div className="absolute -right-10 -top-16 h-52 w-52 rounded-full bg-white/10" />
          <div className="absolute -bottom-24 right-24 h-52 w-52 rounded-full bg-white/5" />
          <p className="text-sm font-medium uppercase tracking-widest text-indigo-100">
            Available balance
          </p>
          <p className="mt-2 text-5xl font-bold tracking-tight tabular-nums sm:text-6xl">
            {account ? money(account.balance) : "—"}
          </p>
          <p className="mt-3 text-sm text-indigo-100">
            {account ? `Account: ${account.username}` : "Loading account…"}
          </p>
        </section>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <TransferForm token={token} onCompleted={refresh} />
          <History token={token} refreshKey={refreshKey} />
        </div>
      </main>
    </div>
  );
}

export default function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));

  useEffect(() => {
    const onUnauthorized = () => setToken(null);
    window.addEventListener("bank:unauthorized", onUnauthorized);
    return () => window.removeEventListener("bank:unauthorized", onUnauthorized);
  }, []);

  const signIn = (value: string) => {
    localStorage.setItem(TOKEN_KEY, value);
    setToken(value);
  };

  const signOut = () => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
  };

  if (!token) return <AuthScreen onSignedIn={signIn} />;
  return <Dashboard token={token} onSignOut={signOut} />;
}

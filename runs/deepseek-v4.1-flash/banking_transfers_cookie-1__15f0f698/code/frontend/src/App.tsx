import { useCallback, useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";

const TOKEN_KEY = "bank_token";

type Transfer = {
  id: number;
  to_username: string;
  from_username: string;
  amount: number;
  memo: string | null;
  created_at: string;
  direction: "in" | "out";
};

type TransferPage = {
  items: Transfer[];
  total: number;
  page: number;
  page_size: number;
};

type Account = {
  username: string;
  balance: number;
};

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; token?: string | null } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.token) headers["Authorization"] = `Bearer ${options.token}`;

  const response = await fetch(`/api${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  let data: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const message =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : `Request failed (${response.status})`;
    throw new ApiError(message, response.status);
  }

  return data as T;
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-300">
        {label}
      </span>
      {children}
    </label>
  );
}

const inputClass =
  "w-full rounded-xl border border-white/10 bg-ink/70 px-4 py-2.5 text-slate-100 placeholder-slate-500 outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/20";

const buttonClass =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 font-semibold text-ink transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50";

const ghostButtonClass =
  "inline-flex items-center justify-center rounded-xl border border-white/10 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/5";

function AuthScreen({ onSignedIn }: { onSignedIn: (token: string) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "register") {
        await api("/auth/register", {
          method: "POST",
          body: { username, password },
        });
        setNotice("Account created. Sign in to continue.");
        setMode("login");
        setPassword("");
      } else {
        const result = await api<{ token: string }>("/auth/login", {
          method: "POST",
          body: { username, password },
        });
        onSignedIn(result.token);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/15 text-2xl">
            ₿
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Vault Bank
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Move money instantly between accounts.
          </p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-panel/80 p-7 shadow-2xl shadow-black/40 backdrop-blur">
          <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-ink/60 p-1">
            {(["login", "register"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setMode(value);
                  setError(null);
                  setNotice(null);
                }}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                  mode === value
                    ? "bg-accent text-ink"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {value === "login" ? "Sign in" : "Register"}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-4">
            <Field label="Username">
              <input
                className={inputClass}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </Field>
            <Field label="Password">
              <input
                className={inputClass}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                required
              />
            </Field>

            {error && (
              <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-200">
                {error}
              </p>
            )}
            {notice && (
              <p className="rounded-xl border border-accent/30 bg-accent/10 px-4 py-2.5 text-sm text-accent">
                {notice}
              </p>
            )}

            <button type="submit" className={`${buttonClass} w-full`} disabled={busy}>
              {busy
                ? "Please wait…"
                : mode === "login"
                  ? "Sign in"
                  : "Create account"}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          Every new account starts with a balance of $1,000.00.
        </p>
      </div>
    </div>
  );
}

function TransferForm({
  token,
  onSent,
}: {
  token: string;
  onSent: () => void;
}) {
  const [toUsername, setToUsername] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function reset() {
    setToUsername("");
    setAmount("");
    setMemo("");
    setConfirming(false);
  }

  function review(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    const parsed = Number(amount);
    if (!toUsername.trim()) {
      setError("Enter a recipient username.");
      return;
    }
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    setConfirming(true);
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const transfer = await api<Transfer>("/transfers", {
        method: "POST",
        token,
        body: {
          to_username: toUsername.trim(),
          amount: Number(amount),
          memo: memo.trim() || undefined,
        },
      });
      setSuccess(
        `Sent ${formatMoney(transfer.amount)} to ${transfer.to_username}.`,
      );
      reset();
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transfer failed");
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  const parsedAmount = Number(amount);

  return (
    <section className="rounded-3xl border border-white/10 bg-panel/80 p-6 shadow-xl shadow-black/30">
      <h2 className="text-lg font-semibold text-white">Send money</h2>
      <p className="mt-1 text-sm text-slate-400">
        Transfer funds to another account by username.
      </p>

      <form onSubmit={review} className="mt-5 space-y-4">
        <Field label="Recipient username">
          <input
            className={inputClass}
            value={toUsername}
            onChange={(e) => setToUsername(e.target.value)}
            placeholder="e.g. alice"
            disabled={confirming}
            required
          />
        </Field>
        <Field label="Amount (USD)">
          <input
            className={inputClass}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="0.00"
            disabled={confirming}
            required
          />
        </Field>
        <Field label="Memo (optional)">
          <input
            className={inputClass}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="What's this for?"
            disabled={confirming}
            maxLength={500}
          />
        </Field>

        {error && (
          <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-200">
            {error}
          </p>
        )}
        {success && (
          <p className="rounded-xl border border-accent/30 bg-accent/10 px-4 py-2.5 text-sm text-accent">
            {success}
          </p>
        )}

        {confirming ? (
          <div className="rounded-2xl border border-accent/20 bg-accent/5 p-4">
            <p className="text-sm text-slate-300">
              You are about to send{" "}
              <span className="font-semibold text-white">
                {formatMoney(parsedAmount)}
              </span>{" "}
              to{" "}
              <span className="font-semibold text-white">
                {toUsername.trim()}
              </span>
              {memo.trim() && (
                <>
                  {" "}
                  with memo{" "}
                  <span className="italic text-slate-200">
                    “{memo.trim()}”
                  </span>
                </>
              )}
              .
            </p>
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                className={buttonClass}
                onClick={confirm}
                disabled={busy}
              >
                {busy ? "Sending…" : "Confirm transfer"}
              </button>
              <button
                type="button"
                className={ghostButtonClass}
                onClick={() => setConfirming(false)}
                disabled={busy}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button type="submit" className={`${buttonClass} w-full`}>
            Review transfer
          </button>
        )}
      </form>
    </section>
  );
}

function History({
  token,
  refreshKey,
}: {
  token: string;
  refreshKey: number;
}) {
  const [data, setData] = useState<TransferPage | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const pageSize = 8;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api<TransferPage>(
        `/transfers?page=${page}&page_size=${pageSize}`,
        { token },
      );
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load transfers");
    } finally {
      setLoading(false);
    }
  }, [page, token]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  useEffect(() => {
    setPage(1);
  }, [refreshKey]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <section className="rounded-3xl border border-white/10 bg-panel/80 p-6 shadow-xl shadow-black/30">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Transaction history</h2>
          <p className="mt-1 text-sm text-slate-400">
            Money you sent and received.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className={ghostButtonClass}
          disabled={loading}
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error && (
        <p className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-200">
          {error}
        </p>
      )}

      <div className="mt-5 overflow-hidden rounded-2xl border border-white/10">
        <table className="w-full text-left text-sm">
          <thead className="bg-ink/60 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3 font-medium">Direction</th>
              <th className="px-4 py-3 font-medium">Counterparty</th>
              <th className="px-4 py-3 text-right font-medium">Amount</th>
              <th className="px-4 py-3 font-medium">Memo</th>
              <th className="px-4 py-3 font-medium">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {data && data.items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                  No transactions yet.
                </td>
              </tr>
            )}
            {data?.items.map((item) => {
              const incoming = item.direction === "in";
              const counterparty = incoming
                ? item.from_username
                : item.to_username;
              return (
                <tr key={item.id} className="transition hover:bg-white/[0.03]">
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                        incoming
                          ? "bg-accent/15 text-accent"
                          : "bg-sky-400/15 text-sky-300"
                      }`}
                    >
                      {incoming ? "↓ In" : "↑ Out"}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-200">
                    {counterparty}
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-semibold tabular-nums ${
                      incoming ? "text-accent" : "text-slate-200"
                    }`}
                  >
                    {incoming ? "+" : "−"}
                    {formatMoney(item.amount)}
                  </td>
                  <td className="max-w-[16rem] truncate px-4 py-3 text-slate-400">
                    {item.memo || "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-400">
                    {formatDate(item.created_at)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-slate-400">
        <span>
          {data ? `${data.total} transaction${data.total === 1 ? "" : "s"}` : " "}
        </span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className={ghostButtonClass}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
          >
            Previous
          </button>
          <span className="tabular-nums">
            Page {data?.page ?? page} of {totalPages}
          </span>
          <button
            type="button"
            className={ghostButtonClass}
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= totalPages || loading}
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}

function Dashboard({
  token,
  onSignOut,
}: {
  token: string;
  onSignOut: () => void;
}) {
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadAccount = useCallback(async () => {
    try {
      const result = await api<Account>("/account", { token });
      setAccount(result);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onSignOut();
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to load account");
    }
  }, [token, onSignOut]);

  useEffect(() => {
    loadAccount();
  }, [loadAccount, refreshKey]);

  function refresh() {
    setRefreshKey((k) => k + 1);
  }

  return (
    <div className="mx-auto min-h-screen w-full max-w-5xl px-4 py-8 sm:px-6 lg:py-12">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/15 text-xl">
            ₿
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-500">
              Vault Bank
            </p>
            <p className="text-lg font-semibold text-white">
              {account?.username ?? "…"}
            </p>
          </div>
        </div>
        <button type="button" onClick={onSignOut} className={ghostButtonClass}>
          Sign out
        </button>
      </header>

      <section className="mt-8 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-accent/20 via-panel to-panel p-8 shadow-2xl shadow-black/40">
        <p className="text-sm font-medium uppercase tracking-widest text-accent/80">
          Available balance
        </p>
        <p className="mt-3 text-5xl font-bold tracking-tight text-white tabular-nums sm:text-6xl">
          {account ? formatMoney(account.balance) : "—"}
        </p>
        <p className="mt-2 text-sm text-slate-400">
          Signed in as{" "}
          <span className="font-medium text-slate-200">
            {account?.username ?? "…"}
          </span>
        </p>
        {error && (
          <p className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-200">
            {error}
          </p>
        )}
      </section>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <TransferForm token={token} onSent={refresh} />
        <History token={token} refreshKey={refreshKey} />
      </div>
    </div>
  );
}

export default function App() {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem(TOKEN_KEY),
  );

  function signIn(newToken: string) {
    localStorage.setItem(TOKEN_KEY, newToken);
    setToken(newToken);
  }

  const signOut = useCallback(async () => {
    const current = localStorage.getItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    if (current) {
      try {
        await api("/auth/logout", { method: "POST", token: current });
      } catch {
        /* ignore network errors on sign out */
      }
    }
  }, []);

  return (
    <div className="min-h-screen bg-ink text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(34,211,166,0.12),transparent_55%)]" />
      <div className="relative">
        {token ? (
          <Dashboard token={token} onSignOut={signOut} />
        ) : (
          <AuthScreen onSignedIn={signIn} />
        )}
      </div>
    </div>
  );
}

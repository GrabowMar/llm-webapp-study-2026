import { useCallback, useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  ApiError,
  getAdminScores,
  getLeaderboard,
  getMyScores,
  getToken,
  login,
  register,
  setToken,
  submitScore,
  toggleAdminScore,
  type LeaderboardItem,
  type Period,
  type Score,
  type ScoreWithRank,
} from "./api";

type Session = { username: string; token: string };

const SESSION_KEY = "leaderboard.session";

function loadSession(): Session | null {
  const token = getToken();
  if (!token) return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    if (parsed.token === token) return parsed;
    return null;
  } catch {
    return null;
  }
}

function saveSession(session: Session | null) {
  if (session) {
    setToken(session.token);
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } else {
    setToken(null);
    localStorage.removeItem(SESSION_KEY);
  }
}

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";
const btnPrimary =
  "rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-indigo-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50";
const btnGhost =
  "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-40";

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Something went wrong.";
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Card({ title, children, action }: { title: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
        {action}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

function ErrorBanner({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {message}
    </p>
  );
}

/* -------------------------------------------------------------------------- */

function AuthPanel({ onSignedIn }: { onSignedIn: (session: Session) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "register") {
        await register(username.trim(), password);
      }
      const { token } = await login(username.trim(), password);
      const session = { username: username.trim(), token };
      saveSession(session);
      onSignedIn(session);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <Card
        title={mode === "login" ? "Sign in" : "Create an account"}
        action={
          <button
            type="button"
            className="text-sm font-medium text-indigo-600 hover:underline"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError("");
            }}
          >
            {mode === "login" ? "Need an account? Register" : "Have an account? Sign in"}
          </button>
        }
      >
        <ErrorBanner message={error} />
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="username" className="mb-1 block text-sm font-medium text-slate-700">
              Username
            </label>
            <input
              id="username"
              className={inputCls}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              className={inputCls}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
            />
          </div>
          <button type="submit" className={`${btnPrimary} w-full`} disabled={busy}>
            {busy ? "Working…" : mode === "login" ? "Sign in" : "Register"}
          </button>
        </form>
        <p className="mt-3 text-xs text-slate-400">
          {mode === "login"
            ? "Scores are submitted by signed-in players."
            : "Pick a username (letters, digits, _ . -) and a password."}
        </p>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

const PERIODS: { id: Period; label: string }[] = [
  { id: "all", label: "All-time" },
  { id: "week", label: "This week" },
  { id: "day", label: "Today" },
];

const TOP3_STYLES: Record<number, string> = {
  1: "bg-amber-50 text-amber-900",
  2: "bg-slate-100 text-slate-700",
  3: "bg-orange-50 text-orange-900",
};

const MEDALS: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

function LeaderboardCard({ me }: { me: string }) {
  const [period, setPeriod] = useState<Period>("all");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<LeaderboardItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    getLeaderboard(period, 50, query || undefined)
      .then((data) => {
        if (cancelled) return;
        setItems(data.items);
        setTotal(data.total);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [period, query, version]);

  return (
    <Card
      title="Leaderboard"
      action={
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">
            {total} player{total === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            className={btnGhost}
            onClick={() => setVersion((v) => v + 1)}
            title="Refresh"
            disabled={loading}
          >
            ↻ Refresh
          </button>
        </div>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPeriod(p.id)}
              className={`rounded-md px-3 py-1 text-sm font-medium transition ${
                period === p.id ? "bg-white text-indigo-700 shadow" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <form
          className="ml-auto flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(search.trim());
          }}
        >
          <input
            className={`${inputCls} w-44`}
            placeholder="Search player…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search player"
          />
          <button type="submit" className={btnGhost}>
            Search
          </button>
          {query && (
            <button
              type="button"
              className={btnGhost}
              onClick={() => {
                setSearch("");
                setQuery("");
              }}
            >
              Clear
            </button>
          )}
        </form>
      </div>
      <ErrorBanner message={error} />
      {loading && items.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">Loading…</p>
      ) : items.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">
          {query ? `No players matching “${query}”.` : "No scores yet. Be the first!"}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2">Rank</th>
                <th className="px-4 py-2">Player</th>
                <th className="px-4 py-2 text-right">Score</th>
                <th className="px-4 py-2 text-right">Date</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const isMe = item.player.toLowerCase() === me.toLowerCase();
                return (
                  <tr
                    key={item.player}
                    className={`border-b border-slate-50 last:border-0 ${
                      isMe
                        ? "bg-indigo-50 font-semibold text-indigo-900"
                        : TOP3_STYLES[item.rank] ?? "hover:bg-slate-50"
                    } ${loading ? "opacity-60" : ""}`}
                  >
                    <td className="px-4 py-2">
                      {MEDALS[item.rank] ? (
                        <span title={`#${item.rank}`}>
                          {MEDALS[item.rank]} <span className="text-xs">{item.rank}</span>
                        </span>
                      ) : (
                        <span className="text-slate-500">{item.rank}</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {item.player}
                      {isMe && <span className="ml-2 rounded bg-indigo-600 px-1.5 py-0.5 text-[10px] text-white">you</span>}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{item.score.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right text-slate-500">{fmtDate(item.achieved_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

function ScoreCard({ onScored }: { onScored: () => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ScoreWithRank | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const score = Number(value);
    if (!Number.isInteger(score) || score < 0) {
      setError("Enter a whole number, 0 or above.");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const res = await submitScore(score);
      setResult(res);
      setValue("");
      onScored();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Submit a score">
      <ErrorBanner message={error} />
      <form onSubmit={handleSubmit} className="flex flex-wrap gap-3">
        <input
          type="number"
          min={0}
          step={1}
          className={`${inputCls} w-40`}
          placeholder="Score"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label="Score"
          required
        />
        <button type="submit" className={btnPrimary} disabled={busy}>
          {busy ? "Submitting…" : "Submit"}
        </button>
      </form>
      {result && (
        <div className="mt-4 space-y-2">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Score <b>{result.score.toLocaleString()}</b> recorded — all-time rank{" "}
            <b>{result.rank === null ? "—" : `#${result.rank}`}</b>.
          </div>
          {result.personal_best && (
            <p className="animate-pulse rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
              New personal best! 🎉
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

function MyScoresCard({ refreshToken }: { refreshToken: number }) {
  const [items, setItems] = useState<Score[]>([]);
  const [best, setBest] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getMyScores()
      .then((data) => {
        if (cancelled) return;
        setItems(data.items);
        setBest(data.best_score);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  return (
    <Card
      title="My submissions"
      action={
        <span className="text-sm text-slate-500">
          Best score: <b className="text-slate-800">{best === null ? "—" : best.toLocaleString()}</b>
        </span>
      }
    >
      <ErrorBanner message={error} />
      {items.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-400">No submissions yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {items.slice(0, 12).map((s) => (
            <li key={s.id} className="flex items-center justify-between py-2 text-sm">
              <span className="tabular-nums font-medium text-slate-800">{s.score.toLocaleString()}</span>
              <span className="text-slate-500">{fmtDate(s.achieved_at)}</span>
              <span
                className={
                  s.is_hidden
                    ? "rounded bg-slate-200 px-2 py-0.5 text-xs text-slate-600"
                    : "rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700"
                }
              >
                {s.is_hidden ? "hidden" : "visible"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

function AdminCard() {
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [items, setItems] = useState<Score[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getAdminScores(page, pageSize)
      .then((data) => {
        if (cancelled) return;
        setItems(data.items);
        setTotal(data.total);
        setError("");
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [page, pageSize, version]);

  const pages = Math.max(1, Math.ceil(total / pageSize));

  async function handleToggle(id: number) {
    try {
      const updated = await toggleAdminScore(id);
      setItems((old) => old.map((s) => (s.id === id ? updated : s)));
      setVersion((v) => v + 1);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Card
      title="Admin · all scores"
      action={
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <button type="button" className={btnGhost} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            ← Prev
          </button>
          <span>
            Page {page} / {pages} ({total} total)
          </span>
          <button
            type="button"
            className={btnGhost}
            disabled={page >= pages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next →
          </button>
        </div>
      }
    >
      <ErrorBanner message={error} />
      {items.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-400">No scores stored yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2">ID</th>
                <th className="px-4 py-2">Player</th>
                <th className="px-4 py-2 text-right">Score</th>
                <th className="px-4 py-2 text-right">Date</th>
                <th className="px-4 py-2 text-center">Status</th>
                <th className="px-4 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-2 text-slate-400">{s.id}</td>
                  <td className="px-4 py-2 font-medium text-slate-800">{s.player}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{s.score.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right text-slate-500">{fmtDate(s.achieved_at)}</td>
                  <td className="px-4 py-2 text-center">
                    <span
                      className={
                        s.is_hidden
                          ? "rounded bg-slate-200 px-2 py-0.5 text-xs text-slate-600"
                          : "rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700"
                      }
                    >
                      {s.is_hidden ? "hidden" : "visible"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      className={`${btnGhost} ${s.is_hidden ? "" : "border-red-200 text-red-700 hover:bg-red-50"}`}
                      onClick={() => handleToggle(s.id)}
                    >
                      {s.is_hidden ? "Show" : "Hide"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

export default function App() {
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const [refreshToken, setRefreshToken] = useState(0);

  const signOut = useCallback(() => {
    saveSession(null);
    setSession(null);
  }, []);

  const isAdmin = session !== null && session.username.toLowerCase() === "admin";

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-lg text-white shadow">
              🏆
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight">Game Leaderboard</h1>
              <p className="text-xs text-slate-500">Compete. Submit. Climb the ranks.</p>
            </div>
          </div>
          {session ? (
            <div className="flex items-center gap-3">
              <span className="hidden text-sm text-slate-500 sm:inline">Signed in as</span>
              <span className="rounded-full bg-indigo-50 px-3 py-1 text-sm font-semibold text-indigo-700">
                {session.username}
                {isAdmin && <span className="ml-1 rounded bg-indigo-600 px-1.5 py-0.5 text-[10px] text-white">admin</span>}
              </span>
              <button type="button" className={btnGhost} onClick={signOut}>
                Sign out
              </button>
            </div>
          ) : null}
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        {session === null ? (
          <AuthPanel onSignedIn={(s) => setSession(s)} />
        ) : (
          <>
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="lg:col-span-1">
                <LeaderboardCard me={session.username} />
              </div>
              <div className="space-y-6">
                <ScoreCard onScored={() => setRefreshToken((t) => t + 1)} />
                <MyScoresCard refreshToken={refreshToken} />
              </div>
            </div>
            {isAdmin && <AdminCard />}
          </>
        )}
      </main>

      <footer className="pb-8 text-center text-xs text-slate-400">
        Scores are ranked by each player's best visible result.
      </footer>
    </div>
  );
}

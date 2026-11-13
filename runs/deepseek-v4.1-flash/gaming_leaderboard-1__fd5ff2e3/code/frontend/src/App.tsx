import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ApiError,
  api,
  getToken,
  setToken,
  type AdminScoresResponse,
  type LeaderboardItem,
  type NewScore,
  type Period,
  type Score,
  type Session,
} from "./api";

const PERIODS: { key: Period; label: string }[] = [
  { key: "all", label: "All-time" },
  { key: "week", label: "This week" },
  { key: "today", label: "Today" },
];

const MEDAL_STYLES = [
  "bg-amber-400 text-amber-950",
  "bg-slate-300 text-slate-800",
  "bg-orange-300 text-orange-950",
];

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {message}
    </p>
  );
}

function AuthPanel({ onSignedIn }: { onSignedIn: (session: Session) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (mode === "register") {
        await api.register(username, password);
        await api.login(username, password);
        setNotice("Account created. You are signed in.");
      } else {
        await api.login(username, password);
      }
      const session = await api.me();
      setUsername("");
      setPassword("");
      onSignedIn(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex rounded-lg bg-slate-100 p-1 text-sm font-medium">
        {(["login", "register"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setMode(value);
              setError(null);
              setNotice(null);
            }}
            className={`flex-1 rounded-md px-3 py-2 transition ${
              mode === value
                ? "bg-white text-slate-900 shadow"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {value === "login" ? "Sign in" : "Register"}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Username</span>
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          />
        </label>
        <ErrorNote message={error} />
        {notice && (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {notice}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
        </button>
      </form>
      <p className="mt-4 text-xs text-slate-500">
        The admin account signs in with the password configured on the server.
      </p>
    </div>
  );
}

function Leaderboard({
  session,
  refreshKey,
}: {
  session: Session | null;
  refreshKey: number;
}) {
  const [period, setPeriod] = useState<Period>("all");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [items, setItems] = useState<LeaderboardItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const requestId = useRef(0);

  useEffect(() => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    api
      .leaderboard(period, appliedSearch)
      .then((data) => {
        if (requestId.current !== id) return;
        setItems(data.items);
        setTotal(data.total);
      })
      .catch((err) => {
        if (requestId.current !== id) return;
        setError(err instanceof Error ? err.message : "Could not load leaderboard");
      })
      .finally(() => {
        if (requestId.current === id) setLoading(false);
      });
  }, [period, appliedSearch, nonce, refreshKey]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Leaderboard</h2>
          <p className="text-sm text-slate-500">
            Best visible score per player · {total} player{total === 1 ? "" : "s"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setNonce((value) => value + 1)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          ↻ Refresh
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 px-5 pt-4">
        <div className="flex rounded-lg bg-slate-100 p-1 text-sm font-medium">
          {PERIODS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setPeriod(option.key)}
              className={`rounded-md px-3 py-1.5 transition ${
                period === option.key
                  ? "bg-white text-slate-900 shadow"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setAppliedSearch(search);
          }}
          className="flex flex-1 gap-2"
        >
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search player…"
            className="min-w-[8rem] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          />
          <button
            type="submit"
            className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-900"
          >
            Search
          </button>
          {appliedSearch && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setAppliedSearch("");
              }}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-50"
            >
              Clear
            </button>
          )}
        </form>
      </div>

      <div className="p-5">
        <ErrorNote message={error} />
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-3 py-2">Rank</th>
                <th className="px-3 py-2">Player</th>
                <th className="px-3 py-2 text-right">Score</th>
                <th className="px-3 py-2 text-right">Date</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const isMe = session?.username === item.player;
                const top = item.rank <= 3;
                return (
                  <tr
                    key={`${item.player}-${item.rank}`}
                    className={`border-t border-slate-100 ${
                      isMe ? "bg-indigo-50" : top ? "bg-amber-50/50" : ""
                    }`}
                  >
                    <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-slate-700">
                      <span
                        className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-bold ${
                          top ? MEDAL_STYLES[item.rank - 1] : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {item.rank}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={isMe ? "font-bold text-indigo-700" : "text-slate-800"}>
                        {item.player}
                      </span>
                      {isMe && (
                        <span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                          you
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold text-slate-900">
                      {item.score.toLocaleString()}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right text-slate-500">
                      {formatDate(item.achieved_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {loading && <p className="py-6 text-center text-sm text-slate-400">Loading…</p>}
        {!loading && items.length === 0 && !error && (
          <p className="py-6 text-center text-sm text-slate-400">
            No scores in this period yet.
          </p>
        )}
      </div>
    </section>
  );
}

function ScoreForm({
  onSubmitted,
}: {
  onSubmitted: (result: NewScore) => void;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<NewScore | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const score = Number(value);
      if (!Number.isInteger(score)) {
        throw new Error("Enter a whole number");
      }
      const submitted = await api.submitScore(score);
      setResult(submitted);
      setValue("");
      onSubmitted(submitted);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit score");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-1 text-lg font-bold text-slate-900">Submit a score</h2>
      <p className="mb-4 text-sm text-slate-500">Your best visible score counts.</p>
      <form onSubmit={submit} className="space-y-3">
        <div className="flex gap-2">
          <input
            type="number"
            inputMode="numeric"
            step="1"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Score"
            required
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
          >
            {busy ? "Saving…" : "Submit"}
          </button>
        </div>
        <ErrorNote message={error} />
      </form>
      {result && (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <p className="font-semibold">
            Score saved — rank #{result.rank ?? "–"}
          </p>
          {result.personal_best && <p className="mt-1 font-bold">New personal best!</p>}
        </div>
      )}
    </section>
  );
}

function MyScores({ refreshKey }: { refreshKey: number }) {
  const [items, setItems] = useState<Score[]>([]);
  const [best, setBest] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .myScores()
      .then((data) => {
        if (cancelled) return;
        setItems(data.items);
        setBest(data.best_score);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load your scores");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const shownBest = best;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Your submissions</h2>
          <p className="text-sm text-slate-500">Newest first</p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-slate-400">Personal best</p>
          <p className="font-mono text-xl font-bold text-indigo-700">
            {shownBest === null ? "—" : shownBest.toLocaleString()}
          </p>
        </div>
      </div>
      <ErrorNote message={error} />
      {loading ? (
        <p className="py-4 text-sm text-slate-400">Loading…</p>
      ) : items.length === 0 ? (
        <p className="py-4 text-sm text-slate-400">No submissions yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {items.map((score) => (
            <li key={score.id} className="flex items-center justify-between gap-3 py-2.5">
              <div>
                <p className="font-mono text-base font-semibold text-slate-900">
                  {score.score.toLocaleString()}
                </p>
                <p className="text-xs text-slate-500">{formatDate(score.achieved_at)}</p>
              </div>
              {score.is_hidden && (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                  hidden
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AdminPanel({ refreshKey }: { refreshKey: number }) {
  const [data, setData] = useState<AdminScoresResponse | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const pageSize = 10;

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .adminScores(page, pageSize)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load scores"))
      .finally(() => setLoading(false));
  }, [page]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  async function toggle(id: number) {
    setBusyId(id);
    setError(null);
    try {
      const updated = await api.toggleScore(id);
      setData((current) =>
        current
          ? {
              ...current,
              items: current.items.map((item) =>
                item.id === updated.id ? { ...item, ...updated } : item,
              ),
            }
          : current,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update score");
    } finally {
      setBusyId(null);
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <section className="rounded-2xl border border-amber-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-100 bg-amber-50/60 p-5">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Admin · all scores</h2>
          <p className="text-sm text-slate-500">
            Hide implausible scores from the leaderboard.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          ↻ Refresh
        </button>
      </div>
      <div className="p-5">
        <ErrorNote message={error} />
        {loading && !data ? (
          <p className="py-4 text-sm text-slate-400">Loading…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-3 py-2">ID</th>
                  <th className="px-3 py-2">Player</th>
                  <th className="px-3 py-2 text-right">Score</th>
                  <th className="px-3 py-2 text-right">Date</th>
                  <th className="px-3 py-2 text-right">State</th>
                </tr>
              </thead>
              <tbody>
                {(data?.items ?? []).map((score) => (
                  <tr key={score.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 text-slate-400">#{score.id}</td>
                    <td className="px-3 py-2 text-slate-800">{score.player}</td>
                    <td className="px-3 py-2 text-right font-mono font-semibold text-slate-900">
                      {score.score.toLocaleString()}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-slate-500">
                      {formatDate(score.achieved_at)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        disabled={busyId === score.id}
                        onClick={() => toggle(score.id)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-60 ${
                          score.is_hidden
                            ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                            : "bg-red-100 text-red-700 hover:bg-red-200"
                        }`}
                      >
                        {score.is_hidden ? "Show" : "Hide"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(data?.items.length ?? 0) === 0 && !loading && (
              <p className="py-4 text-center text-sm text-slate-400">No scores yet.</p>
            )}
          </div>
        )}
        {data && (
          <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
            <span>
              Page {data.page} of {totalPages} · {data.total} total
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!getToken()) {
      setChecking(false);
      return;
    }
    let cancelled = false;
    api
      .me()
      .then((user) => {
        if (!cancelled) setSession(user);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) setToken(null);
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSignedIn = useCallback((user: Session) => {
    setSession(user);
    setRefreshKey((value) => value + 1);
  }, []);

  async function signOut() {
    try {
      await api.logout();
    } catch {
      // ignore network errors on sign-out
    }
    setToken(null);
    setSession(null);
  }

  function handleScore() {
    setRefreshKey((value) => value + 1);
  }

  const header = useMemo(
    () => (
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🏆</span>
            <div>
              <h1 className="text-xl font-black tracking-tight text-slate-900">
                Game Leaderboard
              </h1>
              <p className="text-xs text-slate-500">Best scores, all-time to today.</p>
            </div>
          </div>
          {session && (
            <div className="flex items-center gap-3">
              <span className="hidden text-sm text-slate-600 sm:inline">
                Signed in as{" "}
                <span className="font-semibold text-slate-900">{session.username}</span>
                {session.is_admin && (
                  <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                    admin
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={signOut}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>
    ),
    [session],
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {header}
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        {checking ? (
          <p className="py-16 text-center text-sm text-slate-400">Loading…</p>
        ) : session ? (
          <>
            <div className="grid gap-6 md:grid-cols-2">
              <ScoreForm onSubmitted={handleScore} />
              <MyScores refreshKey={refreshKey} />
            </div>
            <Leaderboard session={session} refreshKey={refreshKey} />
            {session.is_admin && <AdminPanel refreshKey={refreshKey} />}
          </>
        ) : (
          <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_20rem]">
            <Leaderboard session={session} refreshKey={refreshKey} />
            <div className="space-y-4">
              <AuthPanel onSignedIn={handleSignedIn} />
              <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
                Sign in to submit scores and track your personal best.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import AddTrackForm from "./components/AddTrackForm";
import AuthPanel from "./components/AuthPanel";
import PlayerBar from "./components/PlayerBar";
import TrackList from "./components/TrackList";
import { api, ApiError } from "./api";
import type { Session, Track, TrackPage } from "./types";

const SESSION_KEY = "audio.session";
const PAGE_SIZE = 10;

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    if (typeof parsed.token === "string" && typeof parsed.username === "string") {
      return parsed;
    }
  } catch {
    // ignore malformed storage
  }
  return null;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<TrackPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [current, setCurrent] = useState<Track | null>(null);
  const [playNonce, setPlayNonce] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<Track | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [refresh, setRefresh] = useState(0);
  const requestId = useRef(0);

  useEffect(() => {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  }, [session]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(queryInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [queryInput]);

  useEffect(() => {
    const id = ++requestId.current;
    setLoading(true);
    setError("");
    api
      .tracks({ q: query, page, pageSize: PAGE_SIZE })
      .then((result) => {
        if (id !== requestId.current) return;
        setData(result);
        if (result.items.length === 0 && result.total > 0 && page > 1) {
          setPage(Math.max(1, Math.ceil(result.total / PAGE_SIZE)));
        }
      })
      .catch((err) => {
        if (id !== requestId.current) return;
        setError(
          err instanceof ApiError
            ? err.message
            : "Could not load tracks. Please try again.",
        );
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
  }, [query, page, refresh]);

  const refreshTracks = useCallback(() => setRefresh((value) => value + 1), []);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;
  const tracks = data?.items ?? [];

  const playTrack = useCallback((track: Track) => {
    setCurrent(track);
    setPlayNonce((value) => value + 1);
  }, []);

  const handlePlayed = useCallback((updated: Track) => {
    setData((current) =>
      current
        ? {
            ...current,
            items: current.items.map((track) =>
              track.id === updated.id ? updated : track,
            ),
          }
        : current,
    );
    setCurrent((current) => (current?.id === updated.id ? updated : current));
  }, []);

  const confirmDelete = async () => {
    if (!session || !deleteTarget) return;
    setDeletingId(deleteTarget.id);
    try {
      await api.deleteTrack(session.token, deleteTarget.id);
      if (current?.id === deleteTarget.id) setCurrent(null);
      setDeleteTarget(null);
      refreshTracks();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not delete the track.",
      );
      setDeleteTarget(null);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-64 bg-gradient-to-b from-indigo-600/20 to-transparent" />

      <div className="relative mx-auto max-w-6xl px-4 pb-48 pt-8">
        <header className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-400 to-fuchsia-500 shadow-lg shadow-indigo-500/30">
                <svg viewBox="0 0 24 24" className="h-6 w-6 text-white" fill="currentColor">
                  <path d="M9 18V6l11-2v12M9 18a3 3 0 11-6 0 3 3 0 016 0zm11-2a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-white">
                  Audio Library
                </h1>
                <p className="text-sm text-slate-400">
                  A shared collection of audio links. Anyone can listen.
                </p>
              </div>
            </div>
          </div>

          <AuthPanel session={session} onSession={setSession} />
        </header>

        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <main className="min-w-0">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full sm:max-w-sm">
                <svg
                  viewBox="0 0 24 24"
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
                </svg>
                <input
                  value={queryInput}
                  onChange={(event) => setQueryInput(event.target.value)}
                  placeholder="Search by title or artist"
                  aria-label="Search tracks"
                  className="w-full rounded-xl border border-slate-800 bg-slate-900/70 py-2.5 pl-9 pr-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-indigo-500"
                />
              </div>
              <p className="text-xs text-slate-500">
                {data
                  ? `${data.total} track${data.total === 1 ? "" : "s"}${
                      query ? ` matching “${query}”` : ""
                    }`
                  : "Loading..."}
              </p>
            </div>

            {error && (
              <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-rose-900/60 bg-rose-950/40 px-4 py-2.5 text-xs text-rose-300">
                <span>{error}</span>
                <button
                  type="button"
                  onClick={refreshTracks}
                  className="rounded-md border border-rose-800 px-2 py-1 font-medium hover:bg-rose-900/40"
                >
                  Retry
                </button>
              </div>
            )}

            {loading && !data ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-16 animate-pulse rounded-xl border border-slate-800 bg-slate-900/50"
                  />
                ))}
              </div>
            ) : (
              <TrackList
                tracks={tracks}
                session={session}
                currentId={current?.id ?? null}
                onPlay={playTrack}
                onDelete={setDeleteTarget}
                deletingId={deletingId}
              />
            )}

            {totalPages > 1 && (
              <nav className="mt-4 flex items-center justify-between text-sm">
                <button
                  type="button"
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                  disabled={page <= 1}
                  className="rounded-lg border border-slate-800 px-3 py-1.5 text-slate-300 transition hover:border-slate-600 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="text-xs text-slate-400">
                  Page {data?.page ?? page} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                  disabled={page >= totalPages}
                  className="rounded-lg border border-slate-800 px-3 py-1.5 text-slate-300 transition hover:border-slate-600 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </nav>
            )}
          </main>

          <aside className="space-y-4">
            {session ? (
              <AddTrackForm session={session} onCreated={refreshTracks} />
            ) : (
              <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 text-sm text-slate-400 shadow-lg">
                <h2 className="text-base font-semibold text-white">Add to the library</h2>
                <p className="mt-2 text-xs leading-relaxed">
                  Sign in or create an account to add tracks. You can delete the tracks
                  you add, and everyone can play anything in the library.
                </p>
              </section>
            )}
          </aside>
        </div>
      </div>

      <PlayerBar
        tracks={tracks}
        current={current}
        onSelect={playTrack}
        onPlayed={handlePlayed}
        playNonce={playNonce}
      />

      {deleteTarget && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-title"
            className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl"
          >
            <h2 id="delete-title" className="text-base font-semibold text-white">
              Delete track?
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              “{deleteTarget.title}” will be removed from the library. This cannot be
              undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deletingId !== null}
                className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:opacity-60"
              >
                {deletingId !== null ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

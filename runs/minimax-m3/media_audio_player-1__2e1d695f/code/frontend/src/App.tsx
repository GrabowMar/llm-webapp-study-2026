import { useCallback, useEffect, useMemo, useState } from "react";

import { ApiError, api } from "./api";
import { AddTrackForm } from "./components/AddTrackForm";
import { AuthPanel } from "./components/AuthPanel";
import { PlayerBar } from "./components/PlayerBar";
import { TrackList } from "./components/TrackList";
import { SearchIcon } from "./components/icons";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { PlayerProvider, usePlayer } from "./context/PlayerContext";
import type { Track, TrackPage } from "./types";

const PAGE_SIZES = [10, 20, 50];

export default function App() {
  return (
    <AuthProvider>
      <Library />
    </AuthProvider>
  );
}

function Library() {
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [data, setData] = useState<TrackPage>({ items: [], total: 0, page: 1, page_size: 10 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(queryInput.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [queryInput]);

  const load = useCallback(() => {
    setLoading(true);
    api
      .listTracks({ q: query, page, pageSize })
      .then((result) => {
        setData(result);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : "Could not load tracks.");
      })
      .finally(() => setLoading(false));
  }, [query, page, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  const handlePlayed = useCallback((updated: Track) => {
    setData((current) => ({
      ...current,
      items: current.items.map((track) => (track.id === updated.id ? { ...track, play_count: updated.play_count } : track)),
    }));
  }, []);

  const totalPages = Math.max(1, Math.ceil(data.total / Math.max(1, data.page_size)));

  const content = useMemo(
    () => (
      <LibraryContent
        data={data}
        loading={loading}
        error={error}
        queryInput={queryInput}
        onQueryChange={setQueryInput}
        page={page}
        pageSize={pageSize}
        totalPages={totalPages}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
        onReload={load}
      />
    ),
    [
      data,
      loading,
      error,
      queryInput,
      page,
      pageSize,
      totalPages,
      load,
    ],
  );

  return (
    <PlayerProvider queue={data.items} onPlayed={handlePlayed}>
      {content}
    </PlayerProvider>
  );
}

type LibraryContentProps = {
  data: TrackPage;
  loading: boolean;
  error: string | null;
  queryInput: string;
  onQueryChange: (value: string) => void;
  page: number;
  pageSize: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onReload: () => void;
};

function LibraryContent({
  data,
  loading,
  error,
  queryInput,
  onQueryChange,
  page,
  pageSize,
  totalPages,
  onPageChange,
  onPageSizeChange,
  onReload,
}: LibraryContentProps) {
  const { user, initialising, logout } = useAuth();
  const player = usePlayer();
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleDelete(track: Track) {
    setActionError(null);
    try {
      await api.deleteTrack(track.id);
      if (player.currentTrack?.id === track.id) {
        player.stop();
      }
      onReload();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not delete the track.");
    }
  }

  const firstItem = data.total === 0 ? 0 : (data.page - 1) * data.page_size + 1;
  const lastItem = Math.min(data.page * data.page_size, data.total);

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950">
      <header className="sticky top-0 z-30 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="h-5 w-5">
                <path d="M20 3.5v10.9a3.1 3.1 0 1 1-2-2.9V7.3L10 9v8.4a3.1 3.1 0 1 1-2-2.9V6.4l12-2.9Z" />
              </svg>
            </span>
            <div>
              <h1 className="text-base font-semibold leading-tight text-zinc-100">Audio Library</h1>
              <p className="text-xs text-zinc-500">Stream tracks stored as links</p>
            </div>
          </div>

          {user ? (
            <div className="flex items-center gap-3">
              <span className="hidden text-sm text-zinc-400 sm:inline">
                Signed in as <span className="font-medium text-zinc-100">{user.username}</span>
              </span>
              <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-300 sm:hidden">
                {user.username}
              </span>
              <button
                type="button"
                onClick={logout}
                className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm font-medium text-zinc-300 transition hover:border-rose-500/60 hover:text-rose-300"
              >
                Sign out
              </button>
            </div>
          ) : (
            <span className="text-sm text-zinc-500">Browsing as guest</span>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 space-y-8 px-4 pb-40 pt-8">
        {!initialising && !user && (
          <section className="flex justify-center">
            <AuthPanel />
          </section>
        )}

        {user && (
          <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
            <h2 className="text-lg font-semibold text-zinc-100">Add a track</h2>
            <p className="mt-1 mb-4 text-sm text-zinc-400">
              Tracks are stored as links to audio files — the library never uploads or stores audio.
            </p>
            <AddTrackForm onCreated={onReload} />
          </section>
        )}

        <section>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold text-zinc-100">Tracks</h2>
            <div className="relative w-full sm:w-72">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                type="search"
                value={queryInput}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder="Search by title or artist"
                aria-label="Search tracks"
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 py-2 pl-9 pr-3 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30"
              />
            </div>
          </div>

          {error && (
            <p role="alert" className="mb-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {error}
            </p>
          )}
          {actionError && (
            <p role="alert" className="mb-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {actionError}
            </p>
          )}

          <TrackList
            tracks={data.items}
            currentUsername={user?.username ?? null}
            loading={loading}
            onDelete={handleDelete}
          />

          <div className="mt-4 flex flex-col items-center justify-between gap-3 text-sm text-zinc-400 sm:flex-row">
            <span>
              {data.total === 0
                ? "No tracks"
                : `Showing ${firstItem}–${lastItem} of ${data.total} track${data.total === 1 ? "" : "s"}`}
            </span>

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-zinc-500">
                Per page
                <select
                  value={pageSize}
                  onChange={(event) => onPageSizeChange(Number(event.target.value))}
                  className="rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1 text-sm text-zinc-200 outline-none focus:border-emerald-500"
                >
                  {PAGE_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onPageChange(Math.max(1, page - 1))}
                  disabled={page <= 1 || loading}
                  className="rounded-lg border border-zinc-800 px-3 py-1.5 transition hover:border-zinc-600 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="px-2 tabular-nums text-zinc-400">
                  Page {data.page} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => onPageChange(Math.min(totalPages, page + 1))}
                  disabled={page >= totalPages || loading}
                  className="rounded-lg border border-zinc-800 px-3 py-1.5 transition hover:border-zinc-600 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <PlayerBar />
    </div>
  );
}

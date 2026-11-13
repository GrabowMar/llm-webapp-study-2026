import { useCallback, useEffect, useRef, useState } from "react";
import AddTrackForm from "./AddTrackForm";
import AuthPanel from "./AuthPanel";
import PlayerBar from "./PlayerBar";
import TrackList from "./TrackList";
import { ApiError, api, setAuthToken, setUnauthorizedHandler, type Track, type TrackPage } from "./api";

const TOKEN_KEY = "audio-library.token";
const USER_KEY = "audio-library.username";
const PAGE_SIZES = [10, 20, 50];

interface Session {
  token: string;
  username: string;
}

interface Queue {
  q: string;
  page: number;
  pageSize: number;
  total: number;
  items: Track[];
  index: number;
}

function loadSession(): Session | null {
  const token = localStorage.getItem(TOKEN_KEY);
  const username = localStorage.getItem(USER_KEY);
  if (token && username) {
    setAuthToken(token);
    return { token, username };
  }
  return null;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(loadSession);
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [data, setData] = useState<TrackPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [queue, setQueue] = useState<Queue | null>(null);
  const [playRequest, setPlayRequest] = useState(0);
  const [pendingDelete, setPendingDelete] = useState<Track | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [navBusy, setNavBusy] = useState(false);

  const signOutLocal = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setAuthToken(null);
    setSession(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(signOutLocal);
    return () => setUnauthorizedHandler(null);
  }, [signOutLocal]);

  useEffect(() => {
    if (!session) return;
    api.me().catch(() => undefined);
  }, [session]);

  useEffect(() => {
    const next = searchInput.trim();
    if (next === query) return;
    const id = window.setTimeout(() => {
      setQuery(next);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(id);
  }, [searchInput, query]);

  const requestId = useRef(0);
  useEffect(() => {
    const id = ++requestId.current;
    setLoading(true);
    setListError(null);
    api
      .listTracks(query, page, pageSize)
      .then((res) => {
        if (id !== requestId.current) return;
        const lastPage = Math.max(1, Math.ceil(res.total / res.page_size));
        if (res.items.length === 0 && page > lastPage) {
          setPage(lastPage);
          return;
        }
        setData(res);
      })
      .catch((err: unknown) => {
        if (id !== requestId.current) return;
        setListError(err instanceof ApiError ? err.message : "Could not load tracks");
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
  }, [query, page, pageSize, reloadKey]);

  const currentTrack = queue ? queue.items[queue.index] ?? null : null;

  const playFromList = (index: number) => {
    if (!data) return;
    setQueue({ q: query, page: data.page, pageSize: data.page_size, total: data.total, items: data.items, index });
    setPlayRequest((n) => n + 1);
  };

  const queueHasNext = queue
    ? queue.index < queue.items.length - 1 || queue.page * queue.pageSize < queue.total
    : false;
  const queueHasPrev = queue ? queue.index > 0 || queue.page > 1 : false;

  const step = async (dir: 1 | -1) => {
    if (!queue || navBusy) return;
    const nextIndex = queue.index + dir;
    if (nextIndex >= 0 && nextIndex < queue.items.length) {
      setQueue({ ...queue, index: nextIndex });
      setPlayRequest((n) => n + 1);
      return;
    }
    const nextPage = queue.page + dir;
    if (nextPage < 1) return;
    setNavBusy(true);
    try {
      const res = await api.listTracks(queue.q, nextPage, queue.pageSize);
      if (res.items.length === 0) return;
      setQueue({
        q: queue.q,
        page: res.page,
        pageSize: res.page_size,
        total: res.total,
        items: res.items,
        index: dir === 1 ? 0 : res.items.length - 1,
      });
      setPlayRequest((n) => n + 1);
      if (queue.q === query && queue.pageSize === pageSize && page === queue.page) {
        setPage(res.page);
      }
    } catch {
      /* keep current track */
    } finally {
      setNavBusy(false);
    }
  };

  const applyTrackUpdate = (updated: Track) => {
    setData((d) => (d ? { ...d, items: d.items.map((t) => (t.id === updated.id ? updated : t)) } : d));
    setQueue((qu) => (qu ? { ...qu, items: qu.items.map((t) => (t.id === updated.id ? updated : t)) } : qu));
  };

  const handleStarted = (track: Track) => {
    api
      .recordPlay(track.id)
      .then(applyTrackUpdate)
      .catch(() => undefined);
  };

  const handleSignedIn = (token: string, username: string) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, username);
    setAuthToken(token);
    setSession({ token, username });
  };

  const handleSignOut = async () => {
    try {
      await api.logout();
    } catch {
      /* ignore */
    }
    signOutLocal();
  };

  const handleAdded = () => {
    setSearchInput("");
    setQuery("");
    setPage(1);
    setReloadKey((k) => k + 1);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await api.deleteTrack(pendingDelete.id);
      const removedId = pendingDelete.id;
      setPendingDelete(null);
      setQueue((qu) => {
        if (!qu) return qu;
        const idx = qu.items.findIndex((t) => t.id === removedId);
        if (idx === -1) return qu;
        if (idx === qu.index) return null;
        const items = qu.items.filter((t) => t.id !== removedId);
        return { ...qu, items, total: qu.total - 1, index: idx < qu.index ? qu.index - 1 : qu.index };
      });
      setReloadKey((k) => k + 1);
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "Could not delete the track");
      if (err instanceof ApiError && err.status === 404) setReloadKey((k) => k + 1);
    } finally {
      setDeleteBusy(false);
    }
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <div className="min-h-screen bg-slate-950 pb-40 text-slate-100 md:pb-28">
      <header className="border-b border-slate-800 bg-slate-900/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
          <h1 className="text-xl font-bold tracking-tight">
            <span className="text-indigo-400">♪</span> Audio Library
          </h1>
          {session ? (
            <div className="flex items-center gap-3 text-sm">
              <span className="text-slate-400">
                Signed in as <strong className="font-semibold text-slate-100" data-testid="current-user">{session.username}</strong>
              </span>
              <button
                type="button"
                onClick={handleSignOut}
                className="rounded-md border border-slate-600 px-3 py-1.5 text-sm hover:bg-slate-800"
              >
                Sign out
              </button>
            </div>
          ) : (
            <span className="text-sm text-slate-400">Not signed in</span>
          )}
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[1fr_20rem]">
        <section className="min-w-0 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label htmlFor="search" className="sr-only">
              Search tracks
            </label>
            <input
              id="search"
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by title or artist…"
              className="w-full flex-1 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm placeholder-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
            <label className="flex items-center gap-2 text-sm text-slate-400">
              Per page
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="rounded-md border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-slate-100"
              >
                {PAGE_SIZES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {listError && (
            <p role="alert" className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
              {listError}{" "}
              <button type="button" className="underline" onClick={() => setReloadKey((k) => k + 1)}>
                Retry
              </button>
            </p>
          )}

          <TrackList
            tracks={data?.items ?? []}
            loading={loading && !data}
            emptyMessage={query ? `No tracks match “${query}”.` : "No tracks yet."}
            currentTrackId={currentTrack?.id ?? null}
            username={session?.username ?? null}
            onPlay={playFromList}
            onDelete={(t) => {
              setDeleteError(null);
              setPendingDelete(t);
            }}
          />

          {data && (
            <nav className="flex items-center justify-between gap-3 text-sm text-slate-400" aria-label="Pagination">
              <span>
                {data.total === 0
                  ? "0 tracks"
                  : `${(data.page - 1) * data.page_size + 1}–${Math.min(data.page * data.page_size, data.total)} of ${data.total} tracks`}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-md border border-slate-700 px-3 py-1.5 hover:bg-slate-800 disabled:opacity-40"
                >
                  Previous
                </button>
                <span>
                  Page {data.page} of {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages || loading}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded-md border border-slate-700 px-3 py-1.5 hover:bg-slate-800 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </nav>
          )}
        </section>

        <aside className="space-y-6">
          {session ? <AddTrackForm onAdded={handleAdded} /> : <AuthPanel onSignedIn={handleSignedIn} />}
        </aside>
      </main>

      {pendingDelete && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-title"
          onKeyDown={(e) => e.key === "Escape" && !deleteBusy && setPendingDelete(null)}
        >
          <div className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-xl">
            <h2 id="delete-title" className="text-lg font-semibold">
              Delete track?
            </h2>
            <p className="mt-2 text-sm text-slate-300">
              “{pendingDelete.title}”{pendingDelete.artist ? ` by ${pendingDelete.artist}` : ""} will be removed from the library.
            </p>
            {deleteError && <p role="alert" className="mt-2 text-sm text-rose-400">{deleteError}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                autoFocus
                disabled={deleteBusy}
                onClick={() => setPendingDelete(null)}
                className="rounded-md border border-slate-600 px-3 py-1.5 text-sm hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteBusy}
                onClick={confirmDelete}
                className="rounded-md bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
              >
                {deleteBusy ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      <PlayerBar
        track={currentTrack}
        playRequest={playRequest}
        hasPrev={queueHasPrev}
        hasNext={queueHasNext}
        onPrev={() => step(-1)}
        onNext={() => step(1)}
        onStarted={handleStarted}
      />
    </div>
  );
}

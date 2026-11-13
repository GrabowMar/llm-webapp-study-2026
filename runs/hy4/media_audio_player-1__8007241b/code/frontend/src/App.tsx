import { useCallback, useEffect, useRef, useState } from "react";
import {
  api,
  clearSession,
  errorMessage,
  getToken,
  getUsername,
  saveSession,
} from "./api";
import type { Track } from "./api";
import AddTrackForm from "./AddTrackForm";
import AuthPanel from "./AuthPanel";
import Icon from "./Icon";
import Player from "./Player";
import TrackList from "./TrackList";

const PAGE_SIZE = 10;

export default function App() {
  const [token, setToken] = useState<string | null>(getToken());
  const [username, setUsername] = useState<string | null>(getUsername());
  const signedIn = Boolean(token && username);

  const [tracks, setTracks] = useState<Track[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [currentIndex, setCurrentIndex] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);

  const currentIdRef = useRef<number | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(query);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const load = useCallback(async () => {
    setLoading(true);
    setListError(null);
    try {
      const result = await api.listTracks(search, page, PAGE_SIZE);
      setTracks(result.items);
      setTotal(result.total);
      setPage(result.page);
      setCurrentIndex((previous) => {
        if (previous === null) return null;
        const id = currentIdRef.current;
        const found = result.items.findIndex((t) => t.id === id);
        return found >= 0 ? found : null;
      });
    } catch (err) {
      setListError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [search, page, refreshKey]);

  useEffect(() => {
    load();
  }, [load]);

  const currentTrack = currentIndex !== null ? tracks[currentIndex] ?? null : null;
  currentIdRef.current = currentTrack?.id ?? null;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function signIn(newToken: string, newUsername: string) {
    saveSession(newToken, newUsername);
    setToken(newToken);
    setUsername(newUsername);
    setSearch("");
    setQuery("");
    setPage(1);
    setRefreshKey((k) => k + 1);
  }

  function signOut() {
    clearSession();
    setToken(null);
    setUsername(null);
    setRefreshKey((k) => k + 1);
  }

  function selectTrack(index: number) {
    const track = tracks[index];
    if (!track) return;
    const same = currentIndex === index;
    setCurrentIndex(index);
    if (same) {
      setPlaying((p) => !p);
    } else {
      setPlaying(true);
    }
  }

  function step(delta: number) {
    if (!tracks.length) return;
    if (currentIndex === null) {
      setCurrentIndex(0);
      setPlaying(true);
      return;
    }
    const next = (currentIndex + delta + tracks.length) % tracks.length;
    setCurrentIndex(next);
    setPlaying(true);
  }

  async function handleStarted(track: Track) {
    try {
      const updated = await api.recordPlay(track.id);
      setTracks((list) =>
        list.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)),
      );
    } catch {
      // counting a play must not interrupt playback
    }
  }

  async function handleDelete(track: Track) {
    try {
      await api.deleteTrack(track.id);
      setTracks((list) => {
        const next = list.filter((t) => t.id !== track.id);
        if (currentIdRef.current === track.id) {
          setCurrentIndex(null);
          setPlaying(false);
        }
        return next;
      });
      setTotal((n) => Math.max(0, n - 1));
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setListError(errorMessage(err));
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(109,40,217,0.15),_transparent_60%)]" />
      <div className="relative mx-auto max-w-5xl px-4 pb-40 pt-6 sm:px-6">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-700 text-white shadow-lg shadow-violet-900/40">
              <Icon name="music" className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white">Soundboard</h1>
              <p className="text-xs text-slate-400">A shared audio library</p>
            </div>
          </div>
          {signedIn ? (
            <div className="flex items-center gap-3 rounded-full border border-slate-800 bg-slate-900/70 py-1.5 pl-3 pr-1.5">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-600/30 text-[11px] font-bold uppercase text-violet-300">
                  {username?.slice(0, 1)}
                </span>
                <span className="text-sm font-medium text-white">{username}</span>
              </div>
              <button
                type="button"
                onClick={signOut}
                className="inline-flex items-center gap-1.5 rounded-full bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-slate-700 hover:text-white"
              >
                <Icon name="logout" className="h-3.5 w-3.5" /> Sign out
              </button>
            </div>
          ) : (
            <span className="rounded-full border border-slate-800 bg-slate-900/70 px-3 py-1.5 text-xs text-slate-400">
              Anyone can listen · sign in to add tracks
            </span>
          )}
        </header>

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <main className="min-w-0">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <div className="relative min-w-0 flex-1">
                <Icon
                  name="search"
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
                />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search title or artist…"
                  aria-label="Search tracks"
                  className="w-full rounded-lg border border-slate-800 bg-slate-900/70 py-2.5 pl-9 pr-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/30"
                />
              </div>
              <span className="text-xs tabular-nums text-slate-500">
                {total} {total === 1 ? "track" : "tracks"}
              </span>
            </div>

            <TrackList
              tracks={tracks}
              loading={loading}
              error={listError}
              currentId={currentTrack?.id ?? null}
              isPlaying={playing}
              signedIn={signedIn}
              onPlay={selectTrack}
              onDelete={handleDelete}
            />

            <div className="mt-4 flex items-center justify-between gap-3">
              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-violet-500 hover:text-white disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-xs tabular-nums text-slate-400">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-violet-500 hover:text-white disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </main>

          <aside className="space-y-4">
            {signedIn ? (
              <AddTrackForm onAdded={() => setRefreshKey((k) => k + 1)} />
            ) : (
              <AuthPanel onSignedIn={signIn} />
            )}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 text-xs leading-relaxed text-slate-400">
              <p className="mb-1 font-semibold text-slate-300">How it works</p>
              Tracks are links to audio files hosted elsewhere. This app keeps only
              the address and metadata — it never downloads or stores the audio.
              Playing a track records one play when it starts.
              {currentTrack && (
                <span className="mt-2 block text-slate-500">
                  Now loaded: <span className="text-slate-300">{currentTrack.title}</span>
                </span>
              )}
            </div>
          </aside>
        </div>
      </div>

      <Player
        track={currentTrack}
        playing={playing}
        onTogglePlay={() => currentTrack && setPlaying((p) => !p)}
        onNext={() => step(1)}
        onPrev={() => step(-1)}
        onStarted={handleStarted}
      />
    </div>
  );
}

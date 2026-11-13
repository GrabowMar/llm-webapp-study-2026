import { useCallback, useEffect, useRef, useState, type JSX } from "react";
import { ApiError, api, type Track, type TrackList } from "./api";
import AddTrackForm from "./AddTrackForm";
import AuthForm from "./AuthForm";
import PlayerBar from "./PlayerBar";
import { formatDate, formatDuration } from "./format";

const TOKEN_KEY = "audiolib.token";
const NAME_KEY = "audiolib.username";
const PAGE_SIZE = 20;

export default function App(): JSX.Element {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [username, setUsername] = useState<string | null>(() => localStorage.getItem(NAME_KEY));
  const [invalidToken, setInvalidToken] = useState(false);

  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const [listing, setListing] = useState<TrackList | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const [current, setCurrent] = useState<Track | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playsRef = useRef<Set<number>>(new Set());

  const signOut = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(NAME_KEY);
    setToken(null);
    setUsername(null);
    setInvalidToken(false);
  }, []);

  useEffect(() => {
    if (!token) return;
    api.me(token).catch(() => signOut());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .listTracks({ q: query, page, pageSize: PAGE_SIZE })
      .then((res) => {
        if (cancelled) return;
        setListing(res);
        setListError(null);
        setInvalidToken(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setListing(null);
        if (err instanceof ApiError && err.status === 401) setInvalidToken(true);
        setListError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [query, page, refreshKey]);

  useEffect(() => {
    if (!invalidToken) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") signOut();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [invalidToken, signOut]);

  function ensureAudio(): HTMLAudioElement {
    if (!audioRef.current) {
      const a = new Audio();
      a.volume = volume;
      a.muted = muted;
      a.addEventListener("timeupdate", () => setTime(a.currentTime));
      a.addEventListener("loadedmetadata", () => {
        if (isFinite(a.duration) && a.duration > 0) setDuration(a.duration);
      });
      a.addEventListener("ended", () => setPlaying(false));
      audioRef.current = a;
    }
    return audioRef.current;
  }

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.muted = muted;
  }, [volume, muted]);

  useEffect(() => {
    return () => audioRef.current?.pause();
  }, []);

  const tracks = listing?.items ?? [];
  const currentIndex = current ? tracks.findIndex((t) => t.id === current.id) : -1;
  const totalPages = listing ? Math.max(1, Math.ceil(listing.total / PAGE_SIZE)) : 1;

  function startPlayback(track: Track): void {
    const audio = ensureAudio();
    setCurrent(track);
    setTime(0);
    setDuration(track.duration);
    audio.src = track.url;
    audio.load();
    audio.play().then(
      () => {
        setPlaying(true);
        if (!playsRef.current.has(track.id)) {
          playsRef.current.add(track.id);
          api
            .registerPlay(track.id)
            .then((updated) => {
              setListing((l) =>
                l
                  ? {
                      ...l,
                      items: l.items.map((t) => (t.id === updated.id ? { ...t, play_count: updated.play_count } : t)),
                    }
                  : l,
              );
            })
            .catch(() => {
              playsRef.current.delete(track.id);
            });
        }
      },
      () => setPlaying(false),
    );
  }

  function stopPlayback(): void {
    audioRef.current?.pause();
    setCurrent(null);
    setPlaying(false);
    setTime(0);
    setDuration(0);
  }

  async function playTrack(track: Track): Promise<void> {
    if (current?.id === track.id) {
      const audio = audioRef.current;
      if (!audio) return;
      if (audio.paused) {
        await audio.play().catch(() => undefined);
        setPlaying(true);
      } else {
        audio.pause();
        setPlaying(false);
      }
      return;
    }
    startPlayback(track);
  }

  function togglePlay(): void {
    const audio = audioRef.current;
    if (!audio || !current) return;
    if (audio.paused) {
      audio.play().then(
        () => setPlaying(true),
        () => undefined,
      );
    } else {
      audio.pause();
      setPlaying(false);
    }
  }

  function seek(t: number): void {
    const audio = audioRef.current;
    if (!audio) return;
    if (!isNaN(t)) {
      audio.currentTime = t;
      setTime(t);
    }
  }

  function step(delta: 1 | -1): void {
    const base = currentIndex >= 0 ? currentIndex : -1;
    const target = tracks[base + delta];
    if (target) startPlayback(target);
  }

  async function removeTrack(track: Track): Promise<void> {
    if (!token) return;
    if (!window.confirm(`Delete "${track.title}" by ${track.artist}?`)) return;
    try {
      await api.deleteTrack(token, track.id);
      if (current?.id === track.id) stopPlayback();
      const res = await api.listTracks({ q: query, page, pageSize: PAGE_SIZE });
      setListing(res);
    } catch (err) {
      alert(err instanceof Error ? err.message : "could not delete track");
    }
  }

  function submitSearch(value: string): void {
    setSearch(value);
    setQuery(value.trim());
    setPage(1);
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3z" />
              </svg>
            </span>
            <h1 className="text-lg font-bold tracking-tight">Audio Library</h1>
          </div>
          {username ? (
            <div className="flex items-center gap-3 text-sm">
              <span className="text-slate-600">
                Signed in as <strong>{username}</strong>
              </span>
              <button
                onClick={signOut}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
              >
                Sign out
              </button>
            </div>
          ) : (
            <span className="text-xs text-slate-500">Sign in to add tracks</span>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 pb-40 pt-6">
        {!token && (
          <AuthForm
            onAuthed={(t, name) => {
              localStorage.setItem(TOKEN_KEY, t);
              localStorage.setItem(NAME_KEY, name);
              setToken(t);
              setUsername(name);
            }}
          />
        )}

        {invalidToken && (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Your session expired. Sign in again to add or delete tracks — pressing{" "}
            <kbd className="rounded border border-amber-300 px-1">Esc</kbd> signs you out now.
          </p>
        )}

        {token && (
          <AddTrackForm
            token={token}
            onAdded={() => {
              setRefreshKey((k) => k + 1);
              setQuery(search.trim());
              setPage(1);
            }}
          />
        )}

        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitSearch(search);
              }}
              className="flex gap-2"
            >
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search title, artist or uploader…"
                aria-label="Search tracks"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
              <button
                type="submit"
                className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
              >
                Search
              </button>
              {query && (
                <button
                  type="button"
                  onClick={() => submitSearch("")}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
                >
                  Clear
                </button>
              )}
            </form>
          </div>

          {loading && <p className="px-5 py-8 text-center text-sm text-slate-500">Loading tracks…</p>}
          {listError && !loading && <p className="px-5 py-8 text-center text-sm text-red-600">{listError}</p>}
          {!loading && !listError && listing && listing.items.length === 0 && (
            <p className="px-5 py-8 text-center text-sm text-slate-500">
              {query ? `No tracks match “${query}”.` : "No tracks yet — add the first one above."}
            </p>
          )}

          {!loading && listing && listing.items.length > 0 && (
            <ul className="divide-y divide-slate-100">
              {listing.items.map((track) => {
                const isCurrent = current?.id === track.id;
                return (
                  <li key={track.id} className={`flex items-center gap-4 px-5 py-3 ${isCurrent ? "bg-indigo-50/60" : "hover:bg-slate-50"}`}>
                    <button
                      onClick={() => playTrack(track)}
                      aria-label={isCurrent && playing ? `Pause ${track.title}` : `Play ${track.title}`}
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition ${
                        isCurrent
                          ? "bg-indigo-600 text-white hover:bg-indigo-700"
                          : "bg-slate-200 text-slate-600 hover:bg-indigo-600 hover:text-white"
                      }`}
                    >
                      {isCurrent && playing ? (
                        <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                          <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" fill="currentColor" className="ml-0.5 h-4 w-4">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      )}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">{track.title}</p>
                      <p className="truncate text-xs text-slate-500">
                        {track.artist} · added by {track.added_by} · {formatDate(track.created_at)}
                      </p>
                    </div>
                    <div className="hidden text-right text-xs text-slate-500 sm:block">
                      <p className="font-mono">{formatDuration(track.duration)}</p>
                      <p>{track.play_count} plays</p>
                    </div>
                    <div className="w-24 text-right text-xs text-slate-500 sm:hidden">
                      <p className="font-mono">{formatDuration(track.duration)}</p>
                    </div>
                    {token && track.added_by === username && (
                      <button
                        onClick={() => removeTrack(track)}
                        aria-label={`Delete ${track.title}`}
                        className="rounded-md p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                      >
                        <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                          <path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                        </svg>
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {listing && (
            <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-sm text-slate-600">
              <span>
                {listing.total} track{listing.total === 1 ? "" : "s"}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ← Prev
                </button>
                <span className="text-xs">
                  Page {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </section>
      </main>

      <PlayerBar
        track={current}
        playing={playing}
        time={time}
        duration={duration}
        volume={volume}
        muted={muted}
        hasPrev={currentIndex > 0}
        hasNext={currentIndex >= 0 && currentIndex < tracks.length - 1}
        onToggle={togglePlay}
        onSeek={seek}
        onVolume={(v) => {
          setVolume(v);
          if (v > 0) setMuted(false);
        }}
        onMute={() => setMuted((m) => !m)}
        onPrev={() => step(-1)}
        onNext={() => step(1)}
      />
    </div>
  );
}

import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiError, getUsername, getToken, saveSession } from "./api";
import AddTrackForm from "./components/AddTrackForm";
import AuthPanel from "./components/AuthPanel";
import PlayerBar from "./components/PlayerBar";
import TrackList from "./components/TrackList";
import type { Track } from "./types";

const PAGE_SIZE = 10;

const searchInputClass =
  "min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/40";

export default function App() {
  const [token, setToken] = useState<string | null>(() => getToken());
  const [username, setUsername] = useState<string | null>(() => getUsername());
  const signedIn = token !== null;

  const [tracks, setTracks] = useState<Track[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [current, setCurrent] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [playerError, setPlayerError] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .listTracks({ q: activeQuery, page, page_size: PAGE_SIZE })
      .then((result) => {
        if (cancelled) return;
        setTracks(result.items);
        setTotal(result.total);
        setListError(null);
        if (result.items.length === 0 && result.page > 1) {
          const lastPage = Math.max(1, Math.ceil(result.total / result.page_size));
          if (lastPage !== result.page) {
            setPage(lastPage);
          }
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setListError(
            err instanceof ApiError ? err.message : "Could not load the track list.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeQuery, page, reloadKey]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const trimmed = query.trim();
      setActiveQuery((previous) => (previous === trimmed ? previous : trimmed));
      setPage(1);
    }, 350);
    return () => window.clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.volume = volume;
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setPlayerError(null);
    if (!current) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      return;
    }
    audio.src = current.url;
    audio.load();
    setCurrentTime(0);
    setDuration(current.duration || 0);
    audio
      .play()
      .then(() => {
        api
          .addPlay(current.id)
          .then((updated) => {
            setTracks((existing) =>
              existing.map((track) =>
                track.id === updated.id
                  ? { ...track, play_count: updated.play_count }
                  : track,
              ),
            );
            setCurrent((previous) =>
              previous && previous.id === updated.id
                ? { ...previous, play_count: updated.play_count }
                : previous,
            );
          })
          .catch(() => {
            // play counting is best effort
          });
      })
      .catch(() => {
        setIsPlaying(false);
        setPlayerError("This track could not be played from its address.");
      });
  }, [current]);

  const currentIndex =
    current === null ? -1 : tracks.findIndex((track) => track.id === current.id);

  function handlePlayTrack(track: Track) {
    if (current && current.id === track.id) {
      const audio = audioRef.current;
      if (!audio) return;
      if (audio.paused) {
        audio.play().catch(() =>
          setPlayerError("This track could not be played from its address."),
        );
      } else {
        audio.pause();
      }
      return;
    }
    setCurrent(track);
  }

  function handleToggle() {
    if (!current) {
      if (tracks.length > 0) setCurrent(tracks[0]);
      return;
    }
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play().catch(() =>
        setPlayerError("This track could not be played from its address."),
      );
    } else {
      audio.pause();
    }
  }

  function handleNext() {
    if (currentIndex >= 0 && currentIndex < tracks.length - 1) {
      setCurrent(tracks[currentIndex + 1]);
    }
  }

  function handlePrevious() {
    if (currentIndex > 0) {
      setCurrent(tracks[currentIndex - 1]);
    } else {
      const audio = audioRef.current;
      if (audio) audio.currentTime = 0;
      setCurrentTime(0);
    }
  }

  function handleSeek(seconds: number) {
    const audio = audioRef.current;
    if (audio) audio.currentTime = seconds;
    setCurrentTime(seconds);
  }

  function handleVolume(value: number) {
    setVolume(value);
    const audio = audioRef.current;
    if (audio) audio.volume = value;
  }

  async function handleSignOut() {
    try {
      await api.logout();
    } catch {
      // signing out locally is enough
    }
    saveSession(null, null);
    setToken(null);
    setUsername(null);
    setNotice(null);
  }

  function handleSignedIn(newToken: string, newUsername: string) {
    setToken(newToken);
    setUsername(newUsername);
    setNotice(null);
    setReloadKey((key) => key + 1);
  }

  function handleAdded(track: Track) {
    setNotice(null);
    setQuery("");
    setActiveQuery("");
    setPage(1);
    setReloadKey((key) => key + 1);
    if (!current) setCurrent(track);
  }

  async function handleDelete(track: Track) {
    const confirmed = window.confirm(
      `Delete "${track.title}" by ${track.artist || "unknown artist"}? This cannot be undone.`,
    );
    if (!confirmed) return;
    try {
      await api.deleteTrack(track.id);
      setNotice(null);
      setTracks((existing) => existing.filter((item) => item.id !== track.id));
      setTotal((value) => Math.max(0, value - 1));
      if (current && current.id === track.id) setCurrent(null);
      setReloadKey((key) => key + 1);
    } catch (err) {
      setNotice(
        err instanceof ApiError ? err.message : "Could not delete the track.",
      );
    }
  }

  function handleSearch(event: FormEvent) {
    event.preventDefault();
    const trimmed = query.trim();
    setActiveQuery(trimmed);
    setPage(1);
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      <audio
        ref={audioRef}
        preload="metadata"
        hidden
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          const value = e.currentTarget.duration;
          if (Number.isFinite(value) && value > 0) setDuration(value);
        }}
        onEnded={handleNext}
        onError={() => {
          if (current) {
            setIsPlaying(false);
            setPlayerError("This track could not be played from its address.");
          }
        }}
      />

      <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500 text-lg font-bold text-white">
              ♪
            </span>
            <div>
              <h1 className="text-base font-semibold leading-tight">Audio Library</h1>
              <p className="hidden text-xs text-slate-400 sm:block">
                Play tracks straight from their source
              </p>
            </div>
          </div>
          {signedIn ? (
            <div className="flex items-center gap-3">
              <span className="hidden text-sm text-slate-400 sm:inline">Signed in as</span>
              <span className="max-w-40 truncate rounded-lg bg-slate-800 px-2.5 py-1 text-sm font-medium text-slate-100">
                {username}
              </span>
              <button
                type="button"
                onClick={handleSignOut}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-200 transition hover:border-slate-500 hover:bg-slate-800"
              >
                Sign out
              </button>
            </div>
          ) : (
            <span className="text-xs text-slate-500">Browsing as guest</span>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 space-y-5 px-4 py-6 pb-40">
        {!signedIn && <AuthPanel onSignedIn={handleSignedIn} />}
        {signedIn && username && <AddTrackForm onAdded={handleAdded} />}

        <div className="flex flex-wrap items-center gap-3">
          <form onSubmit={handleSearch} className="flex min-w-64 flex-1 gap-2">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by title, artist or username"
              aria-label="Search tracks"
              className={searchInputClass}
            />
            <button
              type="submit"
              className="shrink-0 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-700"
            >
              Search
            </button>
          </form>
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <button
              type="button"
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              disabled={page <= 1}
              className="rounded-lg border border-slate-700 px-3 py-1.5 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              ← Prev
            </button>
            <span className="tabular-nums">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((value) => value + 1)}
              disabled={page >= totalPages}
              className="rounded-lg border border-slate-700 px-3 py-1.5 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        </div>

        {notice && (
          <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {notice}
          </p>
        )}

        <TrackList
          tracks={tracks}
          username={username}
          currentId={current ? current.id : null}
          isPlaying={isPlaying}
          loading={loading}
          error={listError}
          onPlay={handlePlayTrack}
          onDelete={handleDelete}
        />

        <p className="text-xs text-slate-500">
          {total} {total === 1 ? "track" : "tracks"} in the library
          {activeQuery ? ` matching “${activeQuery}”` : ""}
        </p>
      </main>

      <PlayerBar
        track={current}
        isPlaying={isPlaying}
        currentTime={currentTime}
        duration={duration}
        volume={volume}
        error={playerError}
        onToggle={handleToggle}
        onPrevious={handlePrevious}
        onNext={handleNext}
        onSeek={handleSeek}
        onVolume={handleVolume}
      />
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Track,
  addTrack,
  clearSession,
  deleteTrack,
  formatDuration,
  getUsername,
  listTracks,
  login,
  recordPlay,
  register,
  saveSession,
} from "./api";

const PAGE_SIZE = 10;

export default function App() {
  const [username, setUsername] = useState<string | null>(getUsername());
  const [tracks, setTracks] = useState<Track[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  const [current, setCurrent] = useState<Track | null>(null);
  const [index, setIndex] = useState(-1);

  const fetchTracks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listTracks(search, page, PAGE_SIZE);
      setTracks(res.items);
      setTotal(res.total);
    } catch {
      setTracks([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [search, page]);

  useEffect(() => {
    fetchTracks();
  }, [fetchTracks]);

  function onAuthed(token: string, name: string) {
    saveSession(token, name);
    setUsername(name);
  }

  function signOut() {
    clearSession();
    setUsername(null);
  }

  function playTrack(track: Track, i: number) {
    setCurrent(track);
    setIndex(i);
  }

  function playNext() {
    if (index >= 0 && index < tracks.length - 1) {
      playTrack(tracks[index + 1], index + 1);
    }
  }

  function playPrev() {
    if (index > 0) {
      playTrack(tracks[index - 1], index - 1);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="border-b border-neutral-800">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <h1 className="text-xl font-semibold tracking-tight">Audio Player</h1>
          {username ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-neutral-300">
                Signed in as{" "}
                <span className="font-medium text-emerald-400">{username}</span>
              </span>
              <button
                onClick={signOut}
                className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800"
              >
                Sign out
              </button>
            </div>
          ) : (
            <AuthForms onAuthed={onAuthed} />
          )}
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 pb-40 pt-6">
        {username && <AddTrackForm onAdded={fetchTracks} />}

        <section className="mt-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-medium">Tracks</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setPage(1);
                setSearch(query);
              }}
              className="flex gap-2"
            >
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search title, artist…"
                className="w-64 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm outline-none focus:border-emerald-500"
              />
              <button
                type="submit"
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium hover:bg-emerald-500"
              >
                Search
              </button>
            </form>
          </div>

          {loading ? (
            <p className="py-10 text-center text-neutral-400">Loading…</p>
          ) : tracks.length === 0 ? (
            <p className="py-10 text-center text-neutral-400">No tracks yet.</p>
          ) : (
            <ul className="divide-y divide-neutral-800 rounded-lg border border-neutral-800">
              {tracks.map((track, i) => (
                <TrackRow
                  key={track.id}
                  track={track}
                  isCurrent={current?.id === track.id}
                  canDelete={username != null && track.added_by === username}
                  onPlay={() => playTrack(track, i)}
                  onDeleted={() => {
                    if (current?.id === track.id) setCurrent(null);
                    fetchTracks();
                  }}
                />
              ))}
            </ul>
          )}

          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-sm text-neutral-300">
                Page {page} of {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </section>
      </main>

      <PlayerBar
        track={current}
        onNext={playNext}
        onPrev={playPrev}
        hasNext={index < tracks.length - 1}
        hasPrev={index > 0}
      />
    </div>
  );
}

function AuthForms({ onAuthed }: { onAuthed: (t: string, u: string) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res =
        mode === "login"
          ? await login(username, password)
          : await register(username, password);
      onAuthed(res.token, res.username);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <input
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="Username"
        className="w-32 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm outline-none focus:border-emerald-500"
        required
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        className="w-32 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm outline-none focus:border-emerald-500"
        required
      />
      <button
        type="submit"
        disabled={busy}
        className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
      >
        {mode === "login" ? "Sign in" : "Register"}
      </button>
      <button
        type="button"
        onClick={() => {
          setMode(mode === "login" ? "register" : "login");
          setError("");
        }}
        className="text-sm text-neutral-400 underline hover:text-neutral-200"
      >
        {mode === "login" ? "Register" : "Sign in"}
      </button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </form>
  );
}

function AddTrackForm({ onAdded }: { onAdded: () => void }) {
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [url, setUrl] = useState("");
  const [duration, setDuration] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await addTrack({
        title,
        artist,
        url,
        duration: duration ? Number(duration) : undefined,
      });
      setTitle("");
      setArtist("");
      setUrl("");
      setDuration("");
      onAdded();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4"
    >
      <h2 className="mb-3 text-lg font-medium">Add a track</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-emerald-500"
          required
        />
        <input
          value={artist}
          onChange={(e) => setArtist(e.target.value)}
          placeholder="Artist"
          className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-emerald-500"
        />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Audio URL (http/https)"
          className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-emerald-500 sm:col-span-2"
          required
        />
        <input
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          placeholder="Duration in seconds (optional)"
          type="number"
          min="0"
          className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-emerald-500"
        />
      </div>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="mt-3 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
      >
        Add track
      </button>
    </form>
  );
}

function TrackRow({
  track,
  isCurrent,
  canDelete,
  onPlay,
  onDeleted,
}: {
  track: Track;
  isCurrent: boolean;
  canDelete: boolean;
  onPlay: () => void;
  onDeleted: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function doDelete() {
    setBusy(true);
    setError("");
    try {
      await deleteTrack(track.id);
      onDeleted();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <li
      className={`flex items-center gap-4 px-4 py-3 ${
        isCurrent ? "bg-emerald-950/40" : ""
      }`}
    >
      <button
        onClick={onPlay}
        title="Play"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white hover:bg-emerald-500"
      >
        {isCurrent ? "❚❚" : "▶"}
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{track.title}</p>
        <p className="truncate text-sm text-neutral-400">
          {track.artist || "Unknown artist"}
        </p>
      </div>
      <div className="hidden text-right text-sm text-neutral-400 sm:block">
        <p>{formatDuration(track.duration)}</p>
        <p>{track.play_count} plays</p>
      </div>
      {canDelete && (
        <div className="flex items-center gap-2">
          {error && <span className="text-xs text-red-400">{error}</span>}
          {confirming ? (
            <>
              <button
                onClick={doDelete}
                disabled={busy}
                className="rounded-md bg-red-600 px-2 py-1 text-xs font-medium hover:bg-red-500 disabled:opacity-50"
              >
                Confirm
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="rounded-md border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              className="rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
            >
              Delete
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function PlayerBar({
  track,
  onNext,
  onPrev,
  hasNext,
  hasPrev,
}: {
  track: Track | null;
  onNext: () => void;
  onPrev: () => void;
  hasNext: boolean;
  hasPrev: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const recordedRef = useRef<number | null>(null);

  useEffect(() => {
    if (track) {
      setPlaying(false);
      setTime(0);
      setDuration(track.duration || 0);
      recordedRef.current = null;
    }
  }, [track]);

  function toggle() {
    const el = audioRef.current;
    if (!el || !track) return;
    if (el.paused) {
      el.play();
    } else {
      el.pause();
    }
  }

  function handlePlay() {
    setPlaying(true);
    if (track && recordedRef.current !== track.id) {
      recordedRef.current = track.id;
      recordPlay(track.id).catch(() => {});
    }
  }

  function handleTime() {
    const el = audioRef.current;
    if (el) setTime(el.currentTime);
  }

  function handleLoaded() {
    const el = audioRef.current;
    if (el && (!track?.duration || !isFinite(el.duration) || el.duration === 0)) {
      setDuration(el.duration || 0);
    }
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const el = audioRef.current;
    const v = Number(e.target.value);
    setTime(v);
    if (el) el.currentTime = v;
  }

  function handleVolume(e: React.ChangeEvent<HTMLInputElement>) {
    const v = Number(e.target.value);
    setVolume(v);
    if (audioRef.current) audioRef.current.volume = v;
  }

  const durationTotal = duration || track?.duration || 0;

  return (
    <div className="fixed bottom-0 left-0 right-0 border-t border-neutral-800 bg-neutral-900/95 backdrop-blur">
      {track ? (
        <audio
          ref={audioRef}
          src={track.url}
          onPlay={handlePlay}
          onPause={() => setPlaying(false)}
          onTimeUpdate={handleTime}
          onLoadedMetadata={handleLoaded}
          onEnded={onNext}
          autoPlay
        />
      ) : null}
      <div className="mx-auto max-w-4xl px-4 py-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs tabular-nums text-neutral-400">
            {formatDuration(time)}
          </span>
          <input
            type="range"
            min={0}
            max={durationTotal || 0}
            step={1}
            value={Math.min(time, durationTotal || 0)}
            onChange={handleSeek}
            disabled={!track || durationTotal === 0}
            className="mx-4 flex-1"
          />
          <span className="text-xs tabular-nums text-neutral-400">
            {formatDuration(durationTotal)}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={onPrev}
              disabled={!hasPrev}
              className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm disabled:opacity-40"
            >
              ⏮
            </button>
            <button
              onClick={toggle}
              disabled={!track}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-40"
            >
              {playing ? "❚❚" : "▶"}
            </button>
            <button
              onClick={onNext}
              disabled={!hasNext}
              className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm disabled:opacity-40"
            >
              ⏭
            </button>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {track ? track.title : "Nothing playing"}
            </p>
            <p className="truncate text-xs text-neutral-400">
              {track ? track.artist || "Unknown artist" : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-400">🔊</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={handleVolume}
              className="w-24"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

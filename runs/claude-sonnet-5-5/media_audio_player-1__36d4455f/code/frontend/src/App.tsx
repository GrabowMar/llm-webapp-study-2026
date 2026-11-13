import { useCallback, useEffect, useRef, useState } from "react";
import AddTrackForm from "./AddTrackForm";
import { api, ApiError, formatDuration, session, setUnauthorizedHandler, Track, TrackPage } from "./api";
import AuthForm, { buttonClass, inputClass } from "./AuthForm";
import PlayerBar from "./PlayerBar";

const PAGE_SIZE = 10;

export default function App() {
  const [username, setUsername] = useState<string | null>(session.token ? session.username : null);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<TrackPage | null>(null);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);
  const [actionError, setActionError] = useState("");

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [current, setCurrent] = useState<Track | null>(null);
  const [queue, setQueue] = useState<Track[]>([]);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [length, setLength] = useState(0);
  const [volume, setVolume] = useState(1);
  const [playerError, setPlayerError] = useState("");
  const currentRef = useRef<Track | null>(null);
  currentRef.current = current;

  const signOut = useCallback(() => {
    session.clear();
    setUsername(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(signOut);
  }, [signOut]);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(query.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    api
      .listTracks(search, page, PAGE_SIZE)
      .then((d) => {
        if (cancelled) return;
        const pages = Math.max(1, Math.ceil(d.total / d.page_size));
        if (page > pages) {
          setPage(pages);
          return;
        }
        setData(d);
        setLoadError("");
        const cur = currentRef.current;
        if (cur && d.items.some((t) => t.id === cur.id)) setQueue(d.items);
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof ApiError ? e.message : "Could not load tracks");
      });
    return () => {
      cancelled = true;
    };
  }, [search, page, reload]);

  function patchTrack(t: Track) {
    setData((d) => (d ? { ...d, items: d.items.map((x) => (x.id === t.id ? t : x)) } : d));
    setQueue((q) => q.map((x) => (x.id === t.id ? t : x)));
    setCurrent((c) => (c && c.id === t.id ? t : c));
  }

  function start(track: Track, list: Track[]) {
    const audio = audioRef.current;
    if (!audio) return;
    setPlayerError("");
    setQueue(list);
    setCurrent(track);
    setPosition(0);
    setLength(track.duration ?? 0);
    audio.src = track.url;
    audio.currentTime = 0;
    api.recordPlay(track.id).then(patchTrack).catch(() => {});
    audio.play().catch((e) => {
      if (e && e.name === "AbortError") return;
      setPlaying(false);
      setPlayerError("Could not play this track");
    });
  }

  function toggle() {
    const audio = audioRef.current;
    if (!audio || !current) return;
    if (audio.paused) {
      if (audio.ended) start(current, queue);
      else audio.play().catch(() => setPlayerError("Could not play this track"));
    } else audio.pause();
  }

  const index = current ? queue.findIndex((t) => t.id === current.id) : -1;
  const hasPrev = index > 0;
  const hasNext = index >= 0 && index < queue.length - 1;
  const next = () => {
    if (hasNext) start(queue[index + 1], queue);
  };
  const prev = () => {
    if (hasPrev) start(queue[index - 1], queue);
  };
  const nextRef = useRef(next);
  nextRef.current = next;

  function seek(t: number) {
    if (audioRef.current) audioRef.current.currentTime = t;
    setPosition(t);
  }

  function changeVolume(v: number) {
    setVolume(v);
    if (audioRef.current) audioRef.current.volume = v;
  }

  async function remove(track: Track) {
    if (!window.confirm(`Delete "${track.title}"?`)) return;
    setActionError("");
    try {
      await api.deleteTrack(track.id);
      if (current && current.id === track.id) {
        const audio = audioRef.current;
        if (audio) {
          audio.pause();
          audio.removeAttribute("src");
          audio.load();
        }
        setCurrent(null);
        setPlaying(false);
        setPosition(0);
        setLength(0);
      }
      setReload((n) => n + 1);
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Could not delete track");
    }
  }

  function trackAdded() {
    setQuery("");
    setSearch("");
    setPage(1);
    setReload((n) => n + 1);
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <div className="min-h-screen bg-slate-50 pb-40 text-slate-900 sm:pb-28">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <h1 className="text-lg font-semibold">Audio player</h1>
          {username ? (
            <div className="flex items-center gap-3 text-sm">
              <span>
                Signed in as <strong data-testid="username">{username}</strong>
              </span>
              <button className="rounded border border-slate-300 px-3 py-1.5 hover:bg-slate-100" onClick={signOut}>
                Sign out
              </button>
            </div>
          ) : (
            <AuthForm
              onSignedIn={(token, name) => {
                session.set(token, name);
                setUsername(name);
              }}
            />
          )}
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-4 px-4 py-6">
        {username && <AddTrackForm onAdded={trackAdded} />}

        <input
          className={inputClass}
          type="search"
          placeholder="Search by title or artist"
          aria-label="Search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        {loadError && (
          <p role="alert" className="text-sm text-red-600">
            {loadError}
          </p>
        )}
        {actionError && (
          <p role="alert" className="text-sm text-red-600">
            {actionError}
          </p>
        )}

        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-100 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Title</th>
                <th className="px-3 py-2">Artist</th>
                <th className="px-3 py-2">Duration</th>
                <th className="px-3 py-2">Plays</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {data && data.items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                    {search ? "No tracks match your search." : "No tracks yet."}
                  </td>
                </tr>
              )}
              {data?.items.map((t) => {
                const active = current?.id === t.id;
                return (
                  <tr
                    key={t.id}
                    className={"border-t border-slate-100 " + (active ? "bg-indigo-50" : "hover:bg-slate-50")}
                    data-testid="track-row"
                  >
                    <td className="px-3 py-2 font-medium">
                      <button
                        className="text-left hover:text-indigo-600"
                        aria-label={`Play ${t.title}`}
                        onClick={() => (active ? toggle() : start(t, data.items))}
                      >
                        {active && playing ? "▶ " : ""}
                        {t.title}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-slate-600">{t.artist}</td>
                    <td className="px-3 py-2 tabular-nums text-slate-600">{formatDuration(t.duration)}</td>
                    <td className="px-3 py-2 tabular-nums text-slate-600">{t.play_count}</td>
                    <td className="px-3 py-2 text-right">
                      {username && t.added_by === username && (
                        <button
                          className="text-red-600 hover:underline"
                          onClick={() => remove(t)}
                          aria-label={`Delete ${t.title}`}
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between text-sm text-slate-600">
          <span>{data ? `${data.total} track${data.total === 1 ? "" : "s"}` : ""}</span>
          <div className="flex items-center gap-3">
            <button className={buttonClass} disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Previous page
            </button>
            <span>
              Page {page} of {pages}
            </span>
            <button className={buttonClass} disabled={page >= pages} onClick={() => setPage(page + 1)}>
              Next page
            </button>
          </div>
        </div>
      </main>

      <audio
        ref={audioRef}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setLength(isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)}
        onDurationChange={(e) => setLength(isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)}
        onEnded={() => {
          setPlaying(false);
          nextRef.current();
        }}
        onError={() => {
          if (currentRef.current) {
            setPlaying(false);
            setPlayerError("Could not play this track");
          }
        }}
      />

      <PlayerBar
        track={current}
        playing={playing}
        position={position}
        length={length}
        volume={volume}
        error={playerError}
        hasPrev={hasPrev}
        hasNext={hasNext}
        onToggle={toggle}
        onPrev={prev}
        onNext={next}
        onSeek={seek}
        onVolume={changeVolume}
      />
    </div>
  );
}

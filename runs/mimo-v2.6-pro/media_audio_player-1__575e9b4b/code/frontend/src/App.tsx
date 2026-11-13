import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "./api";
import type { Track } from "./api";
import AddTrackForm from "./components/AddTrackForm";
import AuthPanel from "./components/AuthPanel";
import PlayerBar from "./components/PlayerBar";
import TrackList from "./components/TrackList";

const PAGE_SIZE = 10;

export default function App() {
  const [username, setUsername] = useState<string | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);

  const [items, setItems] = useState<Track[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState("");

  const [current, setCurrent] = useState<Track | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.9);
  const [playerError, setPlayerError] = useState("");

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const token = api.getToken();
    if (!token) {
      setSessionChecked(true);
      return;
    }
    api
      .me()
      .then((data) => setUsername(data.username))
      .catch(() => {
        api.clearSession();
        setUsername(null);
      })
      .finally(() => setSessionChecked(true));
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.volume = volume;
    }
  }, [volume]);

  const loadTracks = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.listTracks(query, page, PAGE_SIZE);
      setItems(data.items);
      setTotal(data.total);
      setListError("");
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Could not load tracks.");
    } finally {
      setLoading(false);
    }
  }, [query, page]);

  useEffect(() => {
    void loadTracks();
  }, [loadTracks]);

  const applyTrack = (updated: Track) => {
    setItems((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    setCurrent((prev) => (prev && prev.id === updated.id ? updated : prev));
  };

  const playTrack = useCallback(
    async (track: Track) => {
      const audio = audioRef.current;
      if (!audio) return;
      setPlayerError("");
      audio.src = track.url;
      audio.currentTime = 0;
      setCurrent(track);
      setPosition(0);
      setDuration(track.duration > 0 ? track.duration : 0);
      try {
        await audio.play();
        setPlaying(true);
      } catch {
        setPlaying(false);
        setPlayerError("Could not start playback of this track.");
        return;
      }
      try {
        applyTrack(await api.addPlay(track.id));
      } catch {
        // counting a play is best effort
      }
    },
    [],
  );

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!current) {
      if (items.length > 0) {
        void playTrack(items[0]);
      }
      return;
    }
    if (playing) {
      audio.pause();
      return;
    }
    audio
      .play()
      .then(() => setPlaying(true))
      .catch(() => setPlayerError("Could not start playback of this track."));
  };

  const currentIndex = current ? items.findIndex((t) => t.id === current.id) : -1;
  const prevTrack = currentIndex > 0 ? items[currentIndex - 1] : null;
  const nextTrack =
    currentIndex >= 0 && currentIndex < items.length - 1 ? items[currentIndex + 1] : null;

  const stopPlayback = () => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
    }
    setCurrent(null);
    setPlaying(false);
    setPosition(0);
    setDuration(0);
    setPlayerError("");
  };

  const handleSearch = (value: string) => {
    setQuery(value);
    setPage(1);
  };

  const handleAdded = () => {
    if (page !== 1) {
      setPage(1);
    } else {
      void loadTracks();
    }
  };

  const handleDelete = async (track: Track) => {
    if (!window.confirm(`Delete "${track.title}"? This cannot be undone.`)) {
      return;
    }
    try {
      await api.deleteTrack(track.id);
      if (current?.id === track.id) {
        stopPlayback();
      }
      if (page > 1 && items.length === 1) {
        setPage(page - 1);
      } else {
        void loadTracks();
      }
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Could not delete track.");
    }
  };

  const signOut = () => {
    api.clearSession();
    setUsername(null);
    stopPlayback();
  };

  return (
    <div className="min-h-screen bg-neutral-950 pb-40 text-neutral-100">
      <header className="border-b border-neutral-800">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-4">
          <h1 className="text-lg font-bold tracking-tight text-neutral-50">Audio Library</h1>
          <p className="hidden text-sm text-neutral-500 sm:block">
            Tracks from around the web, played from their source
          </p>
          <div className="ml-auto flex items-center gap-3">
            {sessionChecked && username ? (
              <>
                <span className="text-sm text-neutral-400">
                  Signed in as{" "}
                  <span className="font-semibold text-neutral-100">{username}</span>
                </span>
                <button
                  type="button"
                  onClick={signOut}
                  className="rounded-lg bg-neutral-800 px-4 py-2 text-sm font-medium text-neutral-200 hover:bg-neutral-700"
                >
                  Sign out
                </button>
              </>
            ) : (
              sessionChecked && <span className="text-sm text-neutral-500">Not signed in</span>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-6 px-4 py-6">
        {sessionChecked && (username ? <AddTrackForm onAdded={handleAdded} /> : <AuthPanel onSignedIn={setUsername} />)}
        <TrackList
          items={items}
          total={total}
          page={page}
          pageSize={PAGE_SIZE}
          loading={loading}
          error={listError}
          current={current}
          playing={playing}
          username={username}
          onPlay={(track) => {
            if (current && track.id === current.id) {
              togglePlay();
            } else {
              void playTrack(track);
            }
          }}
          onDelete={(track) => void handleDelete(track)}
          onPageChange={setPage}
          onSearch={handleSearch}
        />
      </main>

      <PlayerBar
        current={current}
        playing={playing}
        position={position}
        duration={duration}
        volume={volume}
        hasPrev={prevTrack !== null}
        hasNext={nextTrack !== null}
        error={playerError}
        onToggle={togglePlay}
        onPrev={() => prevTrack && void playTrack(prevTrack)}
        onNext={() => nextTrack && void playTrack(nextTrack)}
        onSeek={(value) => {
          const audio = audioRef.current;
          if (!audio || !current) return;
          const target = Math.min(Math.max(value, 0), duration > 0 ? duration : value);
          audio.currentTime = target;
          setPosition(target);
        }}
        onVolume={setVolume}
      />

      <audio
        ref={audioRef}
        className="hidden"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          if (nextTrack) {
            void playTrack(nextTrack);
          } else {
            setPlaying(false);
          }
        }}
        onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) {
            setDuration(d);
          }
        }}
        onError={() => {
          setPlaying(false);
          setPlayerError("Could not play this track's audio.");
        }}
      />
    </div>
  );
}

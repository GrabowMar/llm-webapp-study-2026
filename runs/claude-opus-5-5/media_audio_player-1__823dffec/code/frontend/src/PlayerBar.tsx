import { useEffect, useRef, useState } from "react";
import { formatTime, type Track } from "./api";

interface Props {
  track: Track | null;
  playRequest: number;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onStarted: (track: Track) => void;
}

const VOLUME_KEY = "audio-library.volume";

function initialVolume(): number {
  const stored = Number(localStorage.getItem(VOLUME_KEY));
  return localStorage.getItem(VOLUME_KEY) !== null && Number.isFinite(stored)
    ? Math.min(1, Math.max(0, stored))
    : 0.8;
}

const iconButton =
  "inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-200 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40";

export default function PlayerBar({ track, playRequest, hasPrev, hasNext, onPrev, onNext, onStarted }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const trackId = track?.id ?? null;
  const trackUrl = track?.url ?? null;
  const startedRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(initialVolume);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seeking, setSeeking] = useState<number | null>(null);

  const trackRef = useRef(track);
  const onStartedRef = useRef(onStarted);
  const onNextRef = useRef(onNext);
  const hasNextRef = useRef(hasNext);
  useEffect(() => {
    trackRef.current = track;
    onStartedRef.current = onStarted;
    onNextRef.current = onNext;
    hasNextRef.current = hasNext;
  });

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.muted = muted;
    localStorage.setItem(VOLUME_KEY, String(volume));
  }, [volume, muted]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const track = trackRef.current;
    startedRef.current = false;
    setError(null);
    setCurrentTime(0);
    setSeeking(null);
    if (!track) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      setDuration(0);
      return;
    }
    setDuration(track.duration ?? 0);
    if (audio.getAttribute("src") !== track.url) {
      audio.src = track.url;
    } else {
      audio.currentTime = 0;
    }
    setLoading(true);
    audio.play().catch((err: unknown) => {
      setLoading(false);
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setError(null);
        return;
      }
      setError("This track could not be played.");
    });
  }, [trackId, trackUrl, playRequest]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onPlaying = () => {
      setPlaying(true);
      setLoading(false);
      setError(null);
      const current = trackRef.current;
      if (!startedRef.current && current) {
        startedRef.current = true;
        onStartedRef.current(current);
      }
    };
    const onPause = () => setPlaying(false);
    const onWaiting = () => setLoading(true);
    const onTime = () => setCurrentTime(audio.currentTime);
    const onMeta = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) setDuration(audio.duration);
    };
    const onEnded = () => {
      setPlaying(false);
      startedRef.current = false;
      if (hasNextRef.current) onNextRef.current();
    };
    const onError = () => {
      if (!audio.getAttribute("src")) return;
      setPlaying(false);
      setLoading(false);
      setError("This track could not be loaded. The audio address may be unavailable.");
    };
    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("durationchange", onMeta);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    return () => {
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("durationchange", onMeta);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio || !track) return;
    if (audio.paused) {
      setError(null);
      audio.play().catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError("This track could not be played.");
      });
    } else {
      audio.pause();
    }
  };

  const commitSeek = (value: number) => {
    const audio = audioRef.current;
    if (audio && Number.isFinite(value)) {
      audio.currentTime = value;
      setCurrentTime(value);
    }
    setSeeking(null);
  };

  const shownTime = seeking ?? currentTime;
  const max = duration > 0 ? duration : 0;

  return (
    <footer className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-700 bg-slate-900/95 backdrop-blur">
      <audio ref={audioRef} preload="metadata" />
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:gap-6">
        <div className="min-w-0 md:w-64" aria-live="polite">
          {track ? (
            <>
              <p className="truncate text-sm font-semibold text-slate-100" data-testid="player-title">
                {track.title}
              </p>
              <p className="truncate text-xs text-slate-400" data-testid="player-artist">
                {track.artist || "Unknown artist"}
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-500">Nothing playing</p>
          )}
          {error && <p className="truncate text-xs text-rose-400" role="alert">{error}</p>}
        </div>

        <div className="flex flex-1 flex-col gap-1">
          <div className="flex items-center justify-center gap-2">
            <button type="button" className={iconButton} onClick={onPrev} disabled={!track || !hasPrev} aria-label="Previous track" title="Previous">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
                <path d="M6 6h2v12H6zM9.5 12 18 18V6z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={togglePlay}
              disabled={!track}
              aria-label={playing ? "Pause" : "Play"}
              title={playing ? "Pause" : "Play"}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-indigo-500 text-white hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {playing ? (
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
                  <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
                </svg>
              ) : loading && track ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" aria-hidden="true" />
              ) : (
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>
            <button type="button" className={iconButton} onClick={onNext} disabled={!track || !hasNext} aria-label="Next track" title="Next">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
                <path d="M16 6h2v12h-2zM6 18l8.5-6L6 6z" />
              </svg>
            </button>
          </div>
          <div className="flex items-center gap-2 text-xs tabular-nums text-slate-400">
            <span className="w-12 text-right">{formatTime(shownTime)}</span>
            <input
              type="range"
              aria-label="Seek"
              min={0}
              max={max || 1}
              step={0.1}
              value={Math.min(shownTime, max || 1)}
              disabled={!track || max === 0}
              onChange={(e) => setSeeking(Number(e.target.value))}
              onMouseUp={(e) => commitSeek(Number((e.target as HTMLInputElement).value))}
              onTouchEnd={(e) => commitSeek(Number((e.target as HTMLInputElement).value))}
              onKeyUp={(e) => commitSeek(Number((e.target as HTMLInputElement).value))}
              onBlur={() => seeking !== null && commitSeek(seeking)}
              className="h-1 flex-1 cursor-pointer accent-indigo-500 disabled:cursor-not-allowed"
            />
            <span className="w-12">{formatTime(max || track?.duration)}</span>
          </div>
        </div>

        <div className="flex items-center justify-center gap-2 md:w-44">
          <button
            type="button"
            className={iconButton}
            onClick={() => setMuted((m) => !m)}
            aria-label={muted || volume === 0 ? "Unmute" : "Mute"}
            title={muted ? "Unmute" : "Mute"}
          >
            {muted || volume === 0 ? (
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
                <path d="M3 9v6h4l5 5V4L7 9zm13.6 3 2.7-2.7-1.4-1.4-2.7 2.7-2.7-2.7-1.4 1.4 2.7 2.7-2.7 2.7 1.4 1.4 2.7-2.7 2.7 2.7 1.4-1.4z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
                <path d="M3 9v6h4l5 5V4L7 9zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05A4.5 4.5 0 0 0 16.5 12zM14 3.23v2.06a7 7 0 0 1 0 13.42v2.06A9 9 0 0 0 14 3.23z" />
              </svg>
            )}
          </button>
          <input
            type="range"
            aria-label="Volume"
            min={0}
            max={1}
            step={0.01}
            value={muted ? 0 : volume}
            onChange={(e) => {
              setVolume(Number(e.target.value));
              setMuted(false);
            }}
            className="h-1 w-28 cursor-pointer accent-indigo-500"
          />
        </div>
      </div>
    </footer>
  );
}

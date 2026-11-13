import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { formatDuration } from "../lib";
import type { Track } from "../types";

interface Props {
  tracks: Track[];
  current: Track | null;
  playNonce: number;
  onSelect: (track: Track) => void;
  onPlayed: (track: Track) => void;
}

export default function PlayerBar({
  tracks,
  current,
  playNonce,
  onSelect,
  onPlayed,
}: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const countedRef = useRef<number | null>(null);
  const loadedIdRef = useRef<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!current) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      loadedIdRef.current = null;
      countedRef.current = null;
      setPlaying(false);
      setTime(0);
      setDuration(0);
      return;
    }

    setFailed(false);
    if (loadedIdRef.current !== current.id) {
      loadedIdRef.current = current.id;
      countedRef.current = null;
      setTime(0);
      setDuration(current.duration || 0);
      audio.src = current.url;
      audio.load();
    }
    audio
      .play()
      .then(() => setPlaying(true))
      .catch(() => setPlaying(false));
  }, [current?.id, playNonce]);

  const index = current ? tracks.findIndex((track) => track.id === current.id) : -1;

  const step = (offset: number) => {
    if (tracks.length === 0) return;
    let next = index;
    if (next === -1) {
      next = offset > 0 ? 0 : tracks.length - 1;
    } else {
      next = (next + offset + tracks.length) % tracks.length;
    }
    onSelect(tracks[next]);
  };

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio || !current) return;
    if (audio.paused) {
      audio.play().catch(() => setFailed(true));
    } else {
      audio.pause();
    }
  };

  const handlePlay = () => {
    setPlaying(true);
    if (!current) return;
    if (countedRef.current === current.id) return;
    countedRef.current = current.id;
    api
      .play(current.id)
      .then(onPlayed)
      .catch(() => undefined);
  };

  const maxDuration = duration || current?.duration || 0;

  const seek = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value);
    setTime(value);
    if (audioRef.current) audioRef.current.currentTime = value;
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-800 bg-slate-950/95 backdrop-blur">
      <audio
        ref={audioRef}
        onPlay={handlePlay}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          if (tracks.length > 1) step(1);
        }}
        onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => {
          const value = event.currentTarget.duration;
          if (Number.isFinite(value)) setDuration(value);
        }}
        onError={() => setFailed(true)}
        preload="metadata"
      />

      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => step(-1)}
              disabled={tracks.length === 0}
              aria-label="Previous track"
              className="rounded-lg p-2 text-slate-300 transition hover:bg-slate-800 hover:text-white disabled:opacity-40"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                <path d="M6 5h2v14H6zM20 5v14l-10-7z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={toggle}
              disabled={!current}
              aria-label={playing ? "Pause" : "Play"}
              className="rounded-full bg-indigo-500 p-2.5 text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {playing ? (
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                  <path d="M7 5h4v14H7zM13 5h4v14h-4z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              disabled={tracks.length === 0}
              aria-label="Next track"
              className="rounded-lg p-2 text-slate-300 transition hover:bg-slate-800 hover:text-white disabled:opacity-40"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                <path d="M16 5h2v14h-2zM4 5v14l10-7z" />
              </svg>
            </button>
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">
              {current ? current.title : "Nothing playing"}
            </p>
            <p className="truncate text-xs text-slate-400">
              {current
                ? current.artist || "Unknown artist"
                : "Pick a track to start listening"}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <svg viewBox="0 0 24 24" className="hidden h-4 w-4 text-slate-400 sm:block" fill="currentColor">
              <path d="M4 9v6h4l5 4V5L8 9zM16 8.5a4 4 0 010 7" />
            </svg>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(event) => setVolume(Number(event.target.value))}
              aria-label="Volume"
              className="h-1 w-16 cursor-pointer accent-indigo-500 sm:w-24"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="w-10 text-right text-[11px] tabular-nums text-slate-400">
            {formatDuration(time || 0)}
          </span>
          <input
            type="range"
            min={0}
            max={maxDuration || 0}
            step={0.1}
            value={Math.min(time, maxDuration || 0)}
            onChange={seek}
            disabled={!current || !maxDuration}
            aria-label="Seek"
            className="h-1 flex-1 cursor-pointer accent-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
          />
          <span className="w-10 text-[11px] tabular-nums text-slate-400">
            {formatDuration(maxDuration)}
          </span>
        </div>

        {failed && (
          <p className="text-xs text-amber-400">
            This audio link could not be played. The file may be unavailable or block
            cross-origin playback.
          </p>
        )}
      </div>
    </div>
  );
}

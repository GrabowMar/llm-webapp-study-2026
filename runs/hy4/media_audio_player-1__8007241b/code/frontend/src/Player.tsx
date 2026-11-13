import { useEffect, useRef, useState } from "react";
import { durationSeconds, formatClock, formatDuration } from "./api";
import type { Track } from "./api";
import Icon from "./Icon";

interface PlayerProps {
  track: Track | null;
  playing: boolean;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrev: () => void;
  onStarted: (track: Track) => void;
}

export default function Player({
  track,
  playing,
  onTogglePlay,
  onNext,
  onPrev,
  onStarted,
}: PlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const startedFor = useRef<number | null>(null);

  const realDuration = duration ?? durationSeconds(track?.duration ?? "");

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = muted ? 0 : volume;
  }, [volume, muted]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !track) return;
    setCurrentTime(0);
    setDuration(null);
    if (startedFor.current !== track.id) {
      startedFor.current = track.id;
      onStarted(track);
    }
    if (playing) {
      audio.play().catch(() => undefined);
    }
    // onStarted is intentionally fired once per track, above
  }, [track?.id]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !track) return;
    if (playing) {
      audio.play().catch(() => undefined);
    } else {
      audio.pause();
    }
  }, [playing, track]);

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    if (audioRef.current) audioRef.current.muted = next;
  }

  function seek(value: number) {
    const audio = audioRef.current;
    if (audio && Number.isFinite(audio.duration)) {
      audio.currentTime = value;
      setCurrentTime(value);
    }
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-800 bg-slate-950/95 backdrop-blur">
      <audio
        ref={audioRef}
        src={track?.url}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onEnded={onNext}
        onDurationChange={(e) => setDuration(e.currentTarget.duration)}
      />
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-5">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-indigo-700 text-white shadow-lg">
            <Icon name="music" className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">
              {track ? track.title : "Nothing playing"}
            </p>
            <p className="truncate text-xs text-slate-400">
              {track ? track.artist : "Select a track from the list"}
            </p>
          </div>
        </div>

        <div className="flex flex-1 flex-col items-center gap-2">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={onPrev}
              aria-label="Previous track"
              className="rounded-full p-1.5 text-slate-300 transition hover:bg-slate-800 hover:text-white"
            >
              <Icon name="prev" className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={onTogglePlay}
              disabled={!track}
              aria-label={playing ? "Pause" : "Play"}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-600 text-white shadow-lg transition hover:bg-violet-500 disabled:opacity-40"
            >
              <Icon name={playing ? "pause" : "play"} className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={onNext}
              aria-label="Next track"
              className="rounded-full p-1.5 text-slate-300 transition hover:bg-slate-800 hover:text-white"
            >
              <Icon name="next" className="h-5 w-5" />
            </button>
          </div>
          <div className="flex w-full items-center gap-2">
            <span className="w-10 text-right text-[11px] tabular-nums text-slate-500">
              {formatClock(currentTime)}
            </span>
            <input
              type="range"
              min={0}
              max={realDuration && Number.isFinite(realDuration) ? realDuration : 0}
              step={0.1}
              value={Math.min(currentTime, realDuration || 0)}
              onChange={(e) => seek(Number(e.target.value))}
              aria-label="Seek"
              className="h-1.5 w-full cursor-pointer accent-violet-500"
            />
            <span className="w-10 text-[11px] tabular-nums text-slate-500">
              {realDuration && Number.isFinite(realDuration)
                ? formatClock(realDuration)
                : track
                  ? formatDuration(track.duration)
                  : "0:00"}
            </span>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-end gap-2">
          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted ? "Unmute" : "Mute"}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white"
          >
            <Icon name={muted || volume === 0 ? "mute" : "volume"} className="h-5 w-5" />
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={muted ? 0 : volume}
            onChange={(e) => {
              setVolume(Number(e.target.value));
              if (muted && Number(e.target.value) > 0) {
                setMuted(false);
                if (audioRef.current) audioRef.current.muted = false;
              }
            }}
            aria-label="Volume"
            className="h-1.5 w-24 cursor-pointer accent-violet-500"
          />
        </div>
      </div>
    </div>
  );
}

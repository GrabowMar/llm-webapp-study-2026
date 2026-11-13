import { formatDuration } from "../format";
import type { Track } from "../types";

interface Props {
  track: Track | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  error: string | null;
  onToggle: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSeek: (seconds: number) => void;
  onVolume: (value: number) => void;
}

export default function PlayerBar({
  track,
  isPlaying,
  currentTime,
  duration,
  volume,
  error,
  onToggle,
  onPrevious,
  onNext,
  onSeek,
  onVolume,
}: Props) {
  const max = duration > 0 ? duration : 0;
  const canControl = track !== null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-800 bg-slate-950/95 backdrop-blur">
      {error && (
        <p className="border-t border-red-500/30 bg-red-500/10 px-4 py-1 text-center text-xs text-red-300">
          {error}
        </p>
      )}
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <div className="min-w-0 w-40 sm:w-56">
          <p className="truncate text-sm font-medium text-slate-100">
            {track ? track.title : "Nothing playing"}
          </p>
          <p className="truncate text-xs text-slate-400">
            {track ? track.artist || "Unknown artist" : "Pick a track to start listening"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onPrevious}
            disabled={!canControl}
            aria-label="Previous track"
            title="Previous"
            className="flex h-9 w-9 items-center justify-center rounded-full text-slate-300 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ⏮
          </button>
          <button
            type="button"
            onClick={onToggle}
            disabled={!canControl}
            aria-label={isPlaying ? "Pause" : "Play"}
            title={isPlaying ? "Pause" : "Play"}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-indigo-500 text-base text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isPlaying ? "❚❚" : "▶"}
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={!canControl}
            aria-label="Next track"
            title="Next"
            className="flex h-9 w-9 items-center justify-center rounded-full text-slate-300 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ⏭
          </button>
        </div>

        <div className="flex min-w-52 flex-1 items-center gap-3">
          <span className="w-11 shrink-0 text-right text-xs tabular-nums text-slate-400">
            {formatDuration(currentTime)}
          </span>
          <input
            type="range"
            min={0}
            max={max > 0 ? max : 1}
            step={0.1}
            value={Math.min(currentTime, max > 0 ? max : 1)}
            onChange={(e) => onSeek(Number(e.target.value))}
            disabled={!canControl || max <= 0}
            aria-label="Seek"
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-700 accent-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
          />
          <span className="w-11 shrink-0 text-xs tabular-nums text-slate-400">
            {formatDuration(max)}
          </span>
        </div>

        <div className="flex w-36 items-center gap-2">
          <span aria-hidden className="text-sm text-slate-400">
            {volume === 0 ? "🔇" : "🔊"}
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => onVolume(Number(e.target.value))}
            aria-label="Volume"
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-700 accent-indigo-500"
          />
        </div>
      </div>
    </div>
  );
}

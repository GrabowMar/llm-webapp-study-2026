import type { Track } from "../api";
import { formatTime } from "../format";

interface Props {
  current: Track | null;
  playing: boolean;
  position: number;
  duration: number;
  volume: number;
  hasPrev: boolean;
  hasNext: boolean;
  error: string;
  onToggle: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSeek: (position: number) => void;
  onVolume: (volume: number) => void;
}

export default function PlayerBar({
  current,
  playing,
  position,
  duration,
  volume,
  hasPrev,
  hasNext,
  error,
  onToggle,
  onPrev,
  onNext,
  onSeek,
  onVolume,
}: Props) {
  return (
    <div className="fixed inset-x-0 bottom-0 border-t border-neutral-800 bg-neutral-950/95 px-4 py-3 backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-col gap-2">
        {error && <p className="text-center text-xs text-red-400">{error}</p>}
        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-neutral-100">
              {current ? current.title : "Nothing playing"}
            </p>
            <p className="truncate text-xs text-neutral-400">
              {current ? current.artist || "Unknown artist" : "Pick a track from the library"}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onPrev}
              disabled={!hasPrev}
              aria-label="Previous track"
              className="rounded-full p-2 text-neutral-300 hover:bg-neutral-800 disabled:opacity-40"
            >
              ⏮
            </button>
            <button
              type="button"
              onClick={onToggle}
              aria-label={playing ? "Pause" : "Play"}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500 text-neutral-950 hover:bg-emerald-400"
            >
              {playing ? "❚❚" : "▶"}
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={!hasNext}
              aria-label="Next track"
              className="rounded-full p-2 text-neutral-300 hover:bg-neutral-800 disabled:opacity-40"
            >
              ⏭
            </button>
          </div>

          <div className="flex w-40 items-center gap-2">
            <span className="text-xs text-neutral-400">🔊</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={(e) => onVolume(Number(e.target.value))}
              aria-label="Volume"
              className="w-full accent-emerald-500"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="w-10 text-right text-xs tabular-nums text-neutral-400">
            {formatTime(position)}
          </span>
          <input
            type="range"
            min={0}
            max={duration > 0 ? duration : 0}
            step={1}
            value={duration > 0 ? Math.min(position, duration) : 0}
            onChange={(e) => onSeek(Number(e.target.value))}
            disabled={!current || duration <= 0}
            aria-label="Seek"
            className="w-full accent-emerald-500 disabled:opacity-40"
          />
          <span className="w-10 text-xs tabular-nums text-neutral-400">{formatTime(duration)}</span>
        </div>
      </div>
    </div>
  );
}

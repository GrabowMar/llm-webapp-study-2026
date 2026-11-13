import { formatDuration, Track } from "./api";

interface Props {
  track: Track | null;
  playing: boolean;
  position: number;
  length: number;
  volume: number;
  error: string;
  hasPrev: boolean;
  hasNext: boolean;
  onToggle: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSeek: (t: number) => void;
  onVolume: (v: number) => void;
}

const btn =
  "rounded-full border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent";

export default function PlayerBar(p: Props) {
  const max = p.length > 0 ? p.length : 0;
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white shadow-[0_-2px_8px_rgba(0,0,0,0.08)]"
      role="region"
      aria-label="Player"
    >
      <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <div className="min-w-0 basis-full sm:basis-48 sm:flex-none">
          <div className="truncate text-sm font-medium text-slate-900" data-testid="now-title">
            {p.track ? p.track.title : "Nothing playing"}
          </div>
          <div className="truncate text-xs text-slate-500" data-testid="now-artist">
            {p.track ? p.track.artist : ""}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className={btn} onClick={p.onPrev} disabled={!p.hasPrev} aria-label="Previous">
            ⏮
          </button>
          <button className={btn + " w-20"} onClick={p.onToggle} disabled={!p.track} aria-label={p.playing ? "Pause" : "Play"}>
            {p.playing ? "Pause" : "Play"}
          </button>
          <button className={btn} onClick={p.onNext} disabled={!p.hasNext} aria-label="Next">
            ⏭
          </button>
        </div>
        <div className="flex min-w-48 flex-1 items-center gap-2 text-xs text-slate-500">
          <span className="w-10 text-right tabular-nums">{formatDuration(p.position)}</span>
          <input
            type="range"
            aria-label="Seek"
            className="flex-1"
            min={0}
            max={max}
            step={0.1}
            value={Math.min(p.position, max)}
            disabled={!p.track || max === 0}
            onChange={(e) => p.onSeek(Number(e.target.value))}
          />
          <span className="w-10 tabular-nums">{max ? formatDuration(max) : "–"}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span>Vol</span>
          <input
            type="range"
            aria-label="Volume"
            className="w-24"
            min={0}
            max={1}
            step={0.01}
            value={p.volume}
            onChange={(e) => p.onVolume(Number(e.target.value))}
          />
        </div>
        {p.error && (
          <div role="alert" className="basis-full text-xs text-red-600">
            {p.error}
          </div>
        )}
      </div>
    </div>
  );
}

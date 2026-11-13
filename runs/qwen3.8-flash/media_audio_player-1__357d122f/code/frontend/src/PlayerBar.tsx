import type { JSX } from "react";
import type { Track } from "./api";
import { formatDuration } from "./format";

interface Props {
  track: Track | null;
  playing: boolean;
  time: number;
  duration: number;
  volume: number;
  muted: boolean;
  hasPrev: boolean;
  hasNext: boolean;
  onToggle: () => void;
  onSeek: (t: number) => void;
  onVolume: (v: number) => void;
  onMute: () => void;
  onPrev: () => void;
  onNext: () => void;
}

const iconBtn =
  "flex items-center justify-center rounded-full text-slate-200 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30";

export default function PlayerBar({
  track,
  playing,
  time,
  duration,
  volume,
  muted,
  hasPrev,
  hasNext,
  onToggle,
  onSeek,
  onVolume,
  onMute,
  onPrev,
  onNext,
}: Props): JSX.Element {
  const effectiveDur = duration || track?.duration || 0;
  const shownVolume = muted ? 0 : volume;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-700 bg-slate-900/95 text-white shadow-2xl backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <div className="order-1 flex items-center gap-1">
          <button type="button" onClick={onPrev} disabled={!hasPrev} aria-label="Previous track" className={`${iconBtn} h-9 w-9`}>
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
              <path d="M6 6h2v12H6zM9.5 12l8.5 6V6z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onToggle}
            disabled={!track}
            aria-label={playing ? "Pause" : "Play"}
            className={`${iconBtn} h-11 w-11 bg-indigo-600 hover:bg-indigo-500`}
          >
            {playing ? (
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor" className="ml-0.5 h-5 w-5">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
          <button type="button" onClick={onNext} disabled={!hasNext} aria-label="Next track" className={`${iconBtn} h-9 w-9`}>
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
              <path d="M16 6h2v12h-2zM6 18l8.5-6L6 6z" />
            </svg>
          </button>
        </div>

        <div className="order-2 min-w-0 max-w-[200px] sm:max-w-xs">
          {track ? (
            <>
              <div className="truncate text-sm font-semibold">{track.title}</div>
              <div className="truncate text-xs text-slate-400">{track.artist}</div>
            </>
          ) : (
            <div className="truncate text-sm text-slate-500">Pick a track to listen</div>
          )}
        </div>

        <div className="order-3 flex flex-1 basis-full items-center gap-2 sm:order-none sm:basis-0">
          <span className="w-12 shrink-0 text-right font-mono text-xs text-slate-400">{formatDuration(time)}</span>
          <input
            type="range"
            min={0}
            max={effectiveDur || 0}
            step={0.5}
            value={Math.min(time, effectiveDur || 0)}
            disabled={!track || !effectiveDur}
            onChange={(e) => onSeek(parseFloat(e.target.value))}
            aria-label="Seek"
            className="h-1.5 min-w-16 flex-1 cursor-pointer appearance-none rounded-full bg-slate-700 accent-indigo-400 disabled:cursor-not-allowed"
          />
          <span className="w-12 shrink-0 font-mono text-xs text-slate-400">{formatDuration(effectiveDur)}</span>
        </div>

        <div className="order-4 flex items-center gap-2 sm:order-none">
          <button type="button" onClick={onMute} aria-label={muted ? "Unmute" : "Mute"} className={`${iconBtn} h-8 w-8`}>
            {shownVolume === 0 ? (
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                <path d="M16.5 12a4.5 4.5 0 0 0-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.79 8.79 0 0 0 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 0 0 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1c2.9.9 5 3.5 5 6.7s-2.1 5.8-5 6.7v2.1c4-.9 7-4.5 7-8.8s-3-7.9-7-8.8z" />
              </svg>
            )}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={shownVolume}
            onChange={(e) => onVolume(parseFloat(e.target.value))}
            aria-label="Volume"
            className="h-1.5 w-20 cursor-pointer appearance-none rounded-full bg-slate-700 accent-indigo-400"
          />
        </div>
      </div>
    </div>
  );
}

import { usePlayer } from "../context/PlayerContext";
import { formatSeconds } from "../lib/format";
import { MuteIcon, NextIcon, PauseIcon, PlayIcon, PreviousIcon, VolumeIcon } from "./icons";

const controlClass =
  "flex h-9 w-9 items-center justify-center rounded-full border border-zinc-700 text-zinc-300 transition hover:border-emerald-500 hover:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-40";

export function PlayerBar() {
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    volume,
    error,
    hasNext,
    hasPrevious,
    togglePlay,
    playNext,
    playPrevious,
    seek,
    setVolume,
  } = usePlayer();

  const total = duration > 0 ? duration : 0;
  const sliderMax = total > 0 ? total : 0;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur">
      {error && (
        <p role="alert" className="border-b border-rose-500/30 bg-rose-500/10 px-4 py-1.5 text-center text-xs text-rose-300">
          {error}
        </p>
      )}
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-6">
        <div className="flex min-w-0 flex-1 items-center gap-3 sm:w-52 sm:flex-none">
          <div className="flex h-11 w-11 flex-none items-center justify-center rounded-lg bg-zinc-900 text-emerald-400">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="h-5 w-5">
              <path d="M20 3.5v10.9a3.1 3.1 0 1 1-2-2.9V7.3L10 9v8.4a3.1 3.1 0 1 1-2-2.9V6.4l12-2.9Z" />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-zinc-100">
              {currentTrack ? currentTrack.title : "Nothing playing"}
            </div>
            <div className="truncate text-xs text-zinc-500">
              {currentTrack ? currentTrack.artist || "Unknown artist" : "Pick a track to start"}
            </div>
          </div>
        </div>

        <div className="flex flex-1 flex-col items-center gap-2">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={playPrevious}
              disabled={!hasPrevious}
              aria-label="Previous track"
              title="Previous"
              className={controlClass}
            >
              <PreviousIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={togglePlay}
              disabled={!currentTrack}
              aria-label={isPlaying ? "Pause" : "Play"}
              title={isPlaying ? "Pause" : "Play"}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500 text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isPlaying ? <PauseIcon className="h-5 w-5" /> : <PlayIcon className="h-5 w-5 translate-x-px" />}
            </button>
            <button
              type="button"
              onClick={playNext}
              disabled={!hasNext}
              aria-label="Next track"
              title="Next"
              className={controlClass}
            >
              <NextIcon className="h-4 w-4" />
            </button>
          </div>

          <div className="flex w-full items-center gap-2">
            <span className="w-10 text-right text-xs tabular-nums text-zinc-500">
              {formatSeconds(currentTime)}
            </span>
            <input
              type="range"
              min={0}
              max={sliderMax || 1}
              step={0.1}
              value={Math.min(currentTime, sliderMax || 1)}
              disabled={!currentTrack || sliderMax === 0}
              onChange={(event) => seek(Number(event.target.value))}
              aria-label="Seek"
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-zinc-800 accent-emerald-500 disabled:cursor-not-allowed"
            />
            <span className="w-10 text-xs tabular-nums text-zinc-500">
              {total > 0 ? formatSeconds(total) : "--:--"}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 sm:w-40">
          <button
            type="button"
            onClick={() => setVolume(volume > 0 ? 0 : 0.8)}
            aria-label={volume > 0 ? "Mute" : "Unmute"}
            title={volume > 0 ? "Mute" : "Unmute"}
            className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-zinc-400 transition hover:text-zinc-100"
          >
            {volume > 0 ? <VolumeIcon className="h-5 w-5" /> : <MuteIcon className="h-5 w-5" />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(event) => setVolume(Number(event.target.value))}
            aria-label="Volume"
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-zinc-800 accent-emerald-500"
          />
        </div>
      </div>
    </div>
  );
}

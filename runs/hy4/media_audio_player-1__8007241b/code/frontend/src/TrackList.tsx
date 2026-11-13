import { useState } from "react";
import { errorMessage, formatDuration } from "./api";
import type { Track } from "./api";
import Icon from "./Icon";

interface TrackListProps {
  tracks: Track[];
  loading: boolean;
  error: string | null;
  currentId: number | null;
  isPlaying: boolean;
  signedIn: boolean;
  onPlay: (index: number) => void;
  onDelete: (track: Track) => void;
}

export default function TrackList({
  tracks,
  loading,
  error,
  currentId,
  isPlaying,
  signedIn,
  onPlay,
  onDelete,
}: TrackListProps) {
  const [confirming, setConfirming] = useState<number | null>(null);

  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-900/60" />
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
        {errorMessage(new Error(error))}
      </div>
    );
  }
  if (!tracks.length) {
    return (
      <div className="rounded-xl border border-dashed border-slate-700 p-10 text-center">
        <Icon name="music" className="mx-auto mb-3 h-8 w-8 text-slate-600" />
        <p className="text-sm font-medium text-slate-300">No tracks found</p>
        <p className="mt-1 text-xs text-slate-500">
          Try a different search, or add the first track.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-slate-800/70 overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50">
      {tracks.map((track, index) => {
        const active = track.id === currentId;
        return (
          <li
            key={track.id}
            className={`group flex items-center gap-3 px-3 py-3 transition sm:gap-4 sm:px-4 ${
              active ? "bg-violet-500/10" : "hover:bg-slate-800/40"
            }`}
          >
            <button
              type="button"
              onClick={() => onPlay(index)}
              aria-label={`Play ${track.title}`}
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition ${
                active
                  ? "bg-violet-600 text-white"
                  : "bg-slate-800 text-slate-300 hover:bg-violet-600 hover:text-white"
              }`}
            >
              <Icon
                name={active && isPlaying ? "pause" : "play"}
                className="h-4 w-4"
              />
            </button>
            <button
              type="button"
              onClick={() => onPlay(index)}
              className="min-w-0 flex-1 text-left"
            >
              <span
                className={`block truncate text-sm font-semibold ${
                  active ? "text-violet-300" : "text-white"
                }`}
              >
                {track.title}
              </span>
              <span className="block truncate text-xs text-slate-400">
                {track.artist} · added by {track.added_by}
              </span>
            </button>
            <span className="hidden w-16 shrink-0 text-right text-xs tabular-nums text-slate-400 sm:block">
              {formatDuration(track.duration)}
            </span>
            <span
              className="hidden w-20 shrink-0 items-center justify-end gap-1 text-xs tabular-nums text-slate-400 sm:flex"
              title="Play count"
            >
              <Icon name="play" className="h-3 w-3" />
              {track.play_count}
            </span>
            {signedIn && track.owned_by_me && (
              <div className="shrink-0">
                {confirming === track.id ? (
                  <span className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setConfirming(null);
                        onDelete(track);
                      }}
                      className="rounded-md bg-rose-600 px-2 py-1 text-xs font-semibold text-white hover:bg-rose-500"
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirming(null)}
                      className="rounded-md px-2 py-1 text-xs text-slate-400 hover:text-white"
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirming(track.id)}
                    aria-label={`Delete ${track.title}`}
                    className="rounded-lg p-2 text-slate-500 opacity-0 transition hover:bg-rose-500/10 hover:text-rose-400 focus:opacity-100 group-hover:opacity-100"
                  >
                    <Icon name="trash" className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

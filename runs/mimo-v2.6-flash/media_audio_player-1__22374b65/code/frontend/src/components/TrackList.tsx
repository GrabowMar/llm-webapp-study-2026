import { formatDate, formatDuration } from "../format";
import type { Track } from "../types";

interface Props {
  tracks: Track[];
  username: string | null;
  currentId: number | null;
  isPlaying: boolean;
  loading: boolean;
  error: string | null;
  onPlay: (track: Track) => void;
  onDelete: (track: Track) => void;
}

export default function TrackList({
  tracks,
  username,
  currentId,
  isPlaying,
  loading,
  error,
  onPlay,
  onDelete,
}: Props) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-10 text-center text-sm text-slate-400">
        Loading tracks…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-6 text-center text-sm text-red-300">
        {error}
      </div>
    );
  }

  if (tracks.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 p-10 text-center text-sm text-slate-400">
        No tracks found.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60">
      <ul className="divide-y divide-slate-800">
        {tracks.map((track) => {
          const isCurrent = currentId === track.id;
          const owns =
            username !== null &&
            track.added_by.toLowerCase() === username.trim().toLowerCase();
          return (
            <li
              key={track.id}
              className={`flex flex-wrap items-center gap-3 px-4 py-3 transition ${
                isCurrent ? "bg-indigo-500/10" : "hover:bg-slate-800/50"
              }`}
            >
              <button
                type="button"
                onClick={() => onPlay(track)}
                aria-label={isCurrent && isPlaying ? `Pause ${track.title}` : `Play ${track.title}`}
                title={isCurrent && isPlaying ? "Pause" : "Play"}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm transition ${
                  isCurrent
                    ? "bg-indigo-500 text-white hover:bg-indigo-400"
                    : "bg-slate-800 text-slate-200 hover:bg-slate-700"
                }`}
              >
                {isCurrent && isPlaying ? "❚❚" : "▶"}
              </button>

              <div className="min-w-0 flex-1">
                <p
                  className={`truncate text-sm font-medium ${
                    isCurrent ? "text-indigo-300" : "text-slate-100"
                  }`}
                >
                  {track.title}
                </p>
                <p className="truncate text-xs text-slate-400">
                  {track.artist || "Unknown artist"} · added by {track.added_by} ·{" "}
                  {formatDate(track.created_at)}
                </p>
              </div>

              <span className="w-16 shrink-0 text-right text-sm tabular-nums text-slate-300">
                {formatDuration(track.duration)}
              </span>
              <span className="w-20 shrink-0 text-right text-xs tabular-nums text-slate-400">
                {track.play_count} {track.play_count === 1 ? "play" : "plays"}
              </span>

              {owns && (
                <button
                  type="button"
                  onClick={() => onDelete(track)}
                  className="shrink-0 rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-medium text-red-300 transition hover:bg-red-500/15"
                >
                  Delete
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

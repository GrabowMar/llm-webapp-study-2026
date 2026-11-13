import { formatDate, formatDuration, formatPlayCount } from "../lib";
import type { Session, Track } from "../types";

interface Props {
  tracks: Track[];
  session: Session | null;
  currentId: number | null;
  onPlay: (track: Track) => void;
  onDelete: (track: Track) => void;
  deletingId: number | null;
}

export default function TrackList({
  tracks,
  session,
  currentId,
  onPlay,
  onDelete,
  deletingId,
}: Props) {
  if (tracks.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 px-6 py-16 text-center">
        <p className="text-sm font-medium text-slate-300">No tracks found</p>
        <p className="mt-1 text-xs text-slate-500">
          Try a different search, or add the first track to the library.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-slate-800 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40">
      {tracks.map((track, position) => {
        const isCurrent = track.id === currentId;
        const isOwner = session !== null && track.added_by === session.username;
        return (
          <li
            key={track.id}
            className={`flex items-center gap-3 px-3 py-3 transition sm:px-4 ${
              isCurrent ? "bg-indigo-500/10" : "hover:bg-slate-800/50"
            }`}
          >
            <button
              type="button"
              onClick={() => onPlay(track)}
              aria-label={`Play ${track.title}`}
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition ${
                isCurrent
                  ? "bg-indigo-500 text-white"
                  : "bg-slate-800 text-slate-300 hover:bg-indigo-500 hover:text-white"
              }`}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            </button>

            <div className="min-w-0 flex-1">
              <p
                className={`truncate text-sm font-semibold ${
                  isCurrent ? "text-indigo-300" : "text-white"
                }`}
              >
                <span className="mr-2 text-xs font-normal text-slate-500">
                  {position + 1}
                </span>
                {track.title}
              </p>
              <p className="truncate text-xs text-slate-400">
                {track.artist || "Unknown artist"}
                <span className="text-slate-600"> · </span>
                added by {track.added_by}
                <span className="text-slate-600"> · </span>
                {formatDate(track.created_at)}
              </p>
            </div>

            <div className="hidden w-16 text-right text-xs tabular-nums text-slate-400 sm:block">
              {formatDuration(track.duration)}
            </div>
            <div className="hidden w-24 text-right text-xs tabular-nums text-slate-400 sm:block">
              {formatPlayCount(track.play_count)}
            </div>

            {isOwner ? (
              <button
                type="button"
                onClick={() => onDelete(track)}
                disabled={deletingId === track.id}
                aria-label={`Delete ${track.title}`}
                className="rounded-lg p-2 text-slate-500 transition hover:bg-rose-950/60 hover:text-rose-400 disabled:opacity-40"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            ) : (
              <span className="w-8" />
            )}
          </li>
        );
      })}
    </ul>
  );
}

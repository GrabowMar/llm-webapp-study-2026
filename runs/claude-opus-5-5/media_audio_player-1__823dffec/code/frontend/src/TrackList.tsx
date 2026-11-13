import { formatTime, type Track } from "./api";

interface Props {
  tracks: Track[];
  loading: boolean;
  emptyMessage: string;
  currentTrackId: number | null;
  username: string | null;
  onPlay: (index: number) => void;
  onDelete: (track: Track) => void;
}

export default function TrackList({ tracks, loading, emptyMessage, currentTrackId, username, onPlay, onDelete }: Props) {
  if (loading) {
    return <p className="rounded-xl border border-slate-800 p-8 text-center text-sm text-slate-400">Loading tracks…</p>;
  }
  if (tracks.length === 0) {
    return <p className="rounded-xl border border-slate-800 p-8 text-center text-sm text-slate-400">{emptyMessage}</p>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-900 text-xs uppercase tracking-wide text-slate-400">
          <tr>
            <th scope="col" className="w-12 px-3 py-2">
              <span className="sr-only">Play</span>
            </th>
            <th scope="col" className="px-3 py-2">Title</th>
            <th scope="col" className="px-3 py-2">Artist</th>
            <th scope="col" className="px-3 py-2 text-right">Duration</th>
            <th scope="col" className="px-3 py-2 text-right">Plays</th>
            <th scope="col" className="hidden px-3 py-2 md:table-cell">Added by</th>
            <th scope="col" className="w-20 px-3 py-2">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {tracks.map((track, index) => {
            const isCurrent = track.id === currentTrackId;
            const isOwn = username !== null && track.added_by.toLowerCase() === username.toLowerCase();
            return (
              <tr
                key={track.id}
                className={`${isCurrent ? "bg-indigo-500/10" : "hover:bg-slate-900"} cursor-pointer`}
                onDoubleClick={() => onPlay(index)}
              >
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => onPlay(index)}
                    aria-label={`Play ${track.title}`}
                    title="Play"
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-full ${
                      isCurrent ? "bg-indigo-500 text-white" : "text-slate-300 hover:bg-slate-700"
                    }`}
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </button>
                </td>
                <td className={`max-w-xs truncate px-3 py-2 font-medium ${isCurrent ? "text-indigo-300" : "text-slate-100"}`}>
                  {track.title}
                </td>
                <td className="max-w-[12rem] truncate px-3 py-2 text-slate-300">{track.artist || "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-400">{formatTime(track.duration)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-400">{track.play_count}</td>
                <td className="hidden max-w-[10rem] truncate px-3 py-2 text-slate-500 md:table-cell">{track.added_by}</td>
                <td className="px-3 py-2 text-right">
                  {isOwn && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(track);
                      }}
                      className="rounded-md px-2 py-1 text-xs text-rose-400 hover:bg-rose-500/10"
                      aria-label={`Delete ${track.title}`}
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

import { useState } from "react";

import { usePlayer } from "../context/PlayerContext";
import { formatDate, formatDuration } from "../lib/format";
import type { Track } from "../types";
import { CloseIcon, PauseIcon, PlayIcon, TrashIcon } from "./icons";

type TrackListProps = {
  tracks: Track[];
  currentUsername: string | null;
  loading: boolean;
  onDelete: (track: Track) => Promise<void> | void;
};

export function TrackList({ tracks, currentUsername, loading, onDelete }: TrackListProps) {
  const { currentTrack, isPlaying, playTrack } = usePlayer();
  const [pendingDelete, setPendingDelete] = useState<Track | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await onDelete(pendingDelete);
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  if (loading && tracks.length === 0) {
    return <p className="px-1 py-8 text-center text-sm text-zinc-500">Loading tracks…</p>;
  }

  if (tracks.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-zinc-800 px-4 py-10 text-center text-sm text-zinc-500">
        No tracks yet.
      </p>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead className="bg-zinc-900/80 text-xs uppercase tracking-wide text-zinc-400">
            <tr>
              <th className="w-12 px-3 py-3" scope="col">
                <span className="sr-only">Play</span>
              </th>
              <th className="px-3 py-3 font-medium" scope="col">
                Title
              </th>
              <th className="px-3 py-3 font-medium" scope="col">
                Artist
              </th>
              <th className="w-24 px-3 py-3 font-medium" scope="col">
                Duration
              </th>
              <th className="w-20 px-3 py-3 font-medium" scope="col">
                Plays
              </th>
              <th className="w-40 px-3 py-3 font-medium" scope="col">
                Added by
              </th>
              <th className="w-16 px-3 py-3" scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/80">
            {tracks.map((track) => {
              const isCurrent = currentTrack?.id === track.id;
              const isPlayingThis = isCurrent && isPlaying;
              const isOwner = currentUsername !== null && track.added_by === currentUsername;
              return (
                <tr
                  key={track.id}
                  className={`bg-zinc-950/40 transition hover:bg-zinc-900/60 ${
                    isCurrent ? "bg-emerald-500/5" : ""
                  }`}
                >
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => playTrack(track)}
                      aria-label={isPlayingThis ? `Pause ${track.title}` : `Play ${track.title}`}
                      title={isPlayingThis ? "Pause" : "Play"}
                      className={`flex h-8 w-8 items-center justify-center rounded-full border transition ${
                        isCurrent
                          ? "border-emerald-500 bg-emerald-500/15 text-emerald-300"
                          : "border-zinc-700 text-zinc-300 hover:border-emerald-500 hover:text-emerald-300"
                      }`}
                    >
                      {isPlayingThis ? (
                        <PauseIcon className="h-3.5 w-3.5" />
                      ) : (
                        <PlayIcon className="h-3.5 w-3.5 translate-x-px" />
                      )}
                    </button>
                  </td>
                  <td className="max-w-[16rem] px-3 py-2">
                    <div className="truncate font-medium text-zinc-100" title={track.title}>
                      {track.title}
                    </div>
                    <a
                      href={track.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block truncate text-xs text-zinc-500 hover:text-emerald-400"
                      title={track.url}
                    >
                      {track.url}
                    </a>
                  </td>
                  <td className="px-3 py-2 text-zinc-300">{track.artist || "—"}</td>
                  <td className="px-3 py-2 tabular-nums text-zinc-400">{formatDuration(track.duration)}</td>
                  <td className="px-3 py-2 tabular-nums text-zinc-400">{track.play_count}</td>
                  <td className="px-3 py-2">
                    <div className="truncate text-zinc-400">{track.added_by ?? "—"}</div>
                    <div className="truncate text-xs text-zinc-600">{formatDate(track.created_at)}</div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {isOwner && (
                      <button
                        type="button"
                        onClick={() => setPendingDelete(track)}
                        aria-label={`Delete ${track.title}`}
                        title="Delete track"
                        className="rounded-md p-1.5 text-zinc-500 transition hover:bg-rose-500/10 hover:text-rose-400"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pendingDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm delete"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) setPendingDelete(null);
          }}
        >
          <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <h3 className="text-base font-semibold text-zinc-100">Delete track?</h3>
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                aria-label="Close dialog"
                className="rounded-md p-1 text-zinc-500 transition hover:text-zinc-200"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-2 text-sm text-zinc-400">
              “{pendingDelete.title}” will be removed from the library. This cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className="rounded-lg bg-rose-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

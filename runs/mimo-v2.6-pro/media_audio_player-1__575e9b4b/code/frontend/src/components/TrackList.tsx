import { useState } from "react";
import type { Track } from "../api";
import { formatTime } from "../format";

interface Props {
  items: Track[];
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  error: string;
  current: Track | null;
  playing: boolean;
  username: string | null;
  onPlay: (track: Track) => void;
  onDelete: (track: Track) => void;
  onPageChange: (page: number) => void;
  onSearch: (query: string) => void;
}

export default function TrackList({
  items,
  total,
  page,
  pageSize,
  loading,
  error,
  current,
  playing,
  username,
  onPlay,
  onDelete,
  onPageChange,
  onSearch,
}: Props) {
  const [searchValue, setSearchValue] = useState("");
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-5">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="mr-auto text-sm font-semibold uppercase tracking-wide text-neutral-400">
          Library · {total} track{total === 1 ? "" : "s"}
        </h2>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            onSearch(searchValue);
          }}
        >
          <input
            className="w-56 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:border-emerald-500 focus:outline-none"
            placeholder="Search title or artist"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
          />
          <button
            type="submit"
            className="rounded-lg bg-neutral-800 px-4 py-2 text-sm font-medium text-neutral-200 hover:bg-neutral-700"
          >
            Search
          </button>
          {searchValue && (
            <button
              type="button"
              onClick={() => {
                setSearchValue("");
                onSearch("");
              }}
              className="rounded-lg px-3 py-2 text-sm font-medium text-neutral-400 hover:text-neutral-200"
            >
              Clear
            </button>
          )}
        </form>
      </div>

      {error && (
        <p className="mb-3 rounded-lg border border-red-900 bg-red-950/60 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-800 text-xs uppercase tracking-wide text-neutral-500">
              <th className="w-10 py-2"></th>
              <th className="py-2">Title</th>
              <th className="py-2">Artist</th>
              <th className="py-2 text-right">Duration</th>
              <th className="py-2 text-right">Plays</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((track) => {
              const isCurrent = current?.id === track.id;
              return (
                <tr
                  key={track.id}
                  className={`border-b border-neutral-800/60 ${
                    isCurrent ? "bg-emerald-500/10" : "hover:bg-neutral-800/40"
                  }`}
                >
                  <td className="py-2">
                    <button
                      type="button"
                      onClick={() => onPlay(track)}
                      aria-label={isCurrent && playing ? "Pause" : "Play"}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-800 text-neutral-200 hover:bg-emerald-500 hover:text-neutral-950"
                    >
                      {isCurrent && playing ? "❚❚" : "▶"}
                    </button>
                  </td>
                  <td className="py-2 pr-3">
                    <button
                      type="button"
                      onClick={() => onPlay(track)}
                      className={`text-left font-medium ${
                        isCurrent ? "text-emerald-400" : "text-neutral-100 hover:text-emerald-400"
                      }`}
                    >
                      {track.title}
                    </button>
                  </td>
                  <td className="py-2 pr-3 text-neutral-300">{track.artist || "—"}</td>
                  <td className="py-2 text-right tabular-nums text-neutral-300">
                    {formatTime(track.duration)}
                  </td>
                  <td className="py-2 text-right tabular-nums text-neutral-300">
                    {track.play_count}
                  </td>
                  <td className="py-2 text-right">
                    {username && track.added_by === username && (
                      <button
                        type="button"
                        onClick={() => onDelete(track)}
                        className="rounded-lg px-2 py-1 text-xs font-medium text-red-400 hover:bg-red-950"
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-neutral-500">
                  No tracks found.
                </td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-neutral-500">
                  Loading…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="rounded-lg bg-neutral-800 px-4 py-2 text-sm font-medium text-neutral-200 hover:bg-neutral-700 disabled:opacity-40"
        >
          Previous
        </button>
        <span className="text-sm text-neutral-400">
          Page {page} of {totalPages}
        </span>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="rounded-lg bg-neutral-800 px-4 py-2 text-sm font-medium text-neutral-200 hover:bg-neutral-700 disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </section>
  );
}

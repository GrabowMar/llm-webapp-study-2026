import { useState } from "react";
import type { FormEvent } from "react";
import * as api from "../api";
import type { Track } from "../api";

interface Props {
  onAdded: (track: Track) => void;
}

export default function AddTrackForm({ onAdded }: Props) {
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [url, setUrl] = useState("");
  const [duration, setDuration] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const track = await api.addTrack({
        title,
        artist,
        url,
        duration: duration.trim() === "" ? 0 : Number(duration),
      });
      setTitle("");
      setArtist("");
      setUrl("");
      setDuration("");
      onAdded(track);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const field =
    "w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:border-emerald-500 focus:outline-none";

  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-400">
        Add a track
      </h2>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-400">
            Title
          </span>
          <input
            className={field}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Song title"
            required
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-400">
            Artist
          </span>
          <input
            className={field}
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            placeholder="Artist name"
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-400">
            Audio URL
          </span>
          <input
            className={field}
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/song.mp3"
            required
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-400">
            Duration (seconds)
          </span>
          <input
            className={field}
            type="number"
            min="0"
            step="1"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder="210"
          />
        </label>
        <div className="flex items-end gap-3">
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-emerald-500 px-5 py-2 text-sm font-semibold text-neutral-950 hover:bg-emerald-400 disabled:opacity-50"
          >
            {busy ? "Adding…" : "Add track"}
          </button>
        </div>
        {error && (
          <p className="sm:col-span-2 rounded-lg border border-red-900 bg-red-950/60 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}
      </form>
    </section>
  );
}

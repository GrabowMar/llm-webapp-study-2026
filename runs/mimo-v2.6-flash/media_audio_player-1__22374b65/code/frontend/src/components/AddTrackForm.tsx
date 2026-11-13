import { useState, type FormEvent } from "react";
import { api, ApiError } from "../api";
import type { Track } from "../types";

interface Props {
  onAdded: (track: Track) => void;
}

const inputClass =
  "w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/40";
const labelClass = "mb-1 block text-xs font-medium text-slate-400";

export default function AddTrackForm({ onAdded }: Props) {
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [url, setUrl] = useState("");
  const [duration, setDuration] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const track = await api.createTrack({ title, artist, url, duration });
      setTitle("");
      setArtist("");
      setUrl("");
      setDuration("");
      onAdded(track);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add the track.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
      <h2 className="mb-4 text-lg font-semibold text-slate-100">Add a track</h2>
      <form onSubmit={handleSubmit} className="grid gap-3 md:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="track-title">
            Title
          </label>
          <input
            id="track-title"
            className={inputClass}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Song title"
            required
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="track-artist">
            Artist
          </label>
          <input
            id="track-artist"
            className={inputClass}
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            placeholder="Artist name"
          />
        </div>
        <div className="md:col-span-2">
          <label className={labelClass} htmlFor="track-url">
            Audio URL
          </label>
          <input
            id="track-url"
            className={inputClass}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/song.mp3"
            required
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="track-duration">
            Duration (seconds or 3:45)
          </label>
          <input
            id="track-duration"
            className={inputClass}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder="180"
            inputMode="decimal"
          />
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Adding…" : "Add track"}
          </button>
        </div>
        {error && (
          <p className="md:col-span-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}
      </form>
    </section>
  );
}

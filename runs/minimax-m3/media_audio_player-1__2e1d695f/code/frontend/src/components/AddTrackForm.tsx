import { useState } from "react";
import type { FormEvent } from "react";

import { ApiError, api } from "../api";
import type { Track } from "../types";

type AddTrackFormProps = {
  onCreated: (track: Track) => void;
};

const inputClass =
  "w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30";

export function AddTrackForm({ onCreated }: AddTrackFormProps) {
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [url, setUrl] = useState("");
  const [duration, setDuration] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setSuccess(null);
    setBusy(true);
    try {
      const track = await api.createTrack({ title, artist, url, duration });
      setTitle("");
      setArtist("");
      setUrl("");
      setDuration("");
      setSuccess(`Added "${track.title}" to the library.`);
      onCreated(track);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFieldErrors(err.errors);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit} noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="track-title" className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400">
            Title
          </label>
          <input
            id="track-title"
            name="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className={inputClass}
            placeholder="Track title"
          />
          {fieldErrors.title && <p className="mt-1 text-xs text-rose-400">{fieldErrors.title}</p>}
        </div>

        <div>
          <label htmlFor="track-artist" className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400">
            Artist
          </label>
          <input
            id="track-artist"
            name="artist"
            value={artist}
            onChange={(event) => setArtist(event.target.value)}
            className={inputClass}
            placeholder="Artist name"
          />
          {fieldErrors.artist && <p className="mt-1 text-xs text-rose-400">{fieldErrors.artist}</p>}
        </div>
      </div>

      <div>
        <label htmlFor="track-url" className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400">
          Audio URL
        </label>
        <input
          id="track-url"
          name="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          className={inputClass}
          placeholder="https://example.com/track.mp3"
        />
        {fieldErrors.url ? (
          <p className="mt-1 text-xs text-rose-400">{fieldErrors.url}</p>
        ) : (
          <p className="mt-1 text-xs text-zinc-500">Only http and https addresses are accepted.</p>
        )}
      </div>

      <div>
        <label htmlFor="track-duration" className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400">
          Duration
        </label>
        <input
          id="track-duration"
          name="duration"
          value={duration}
          onChange={(event) => setDuration(event.target.value)}
          className={inputClass}
          placeholder="e.g. 215 or 3:35"
        />
        {fieldErrors.duration ? (
          <p className="mt-1 text-xs text-rose-400">{fieldErrors.duration}</p>
        ) : (
          <p className="mt-1 text-xs text-zinc-500">Seconds (215) or minutes:seconds (3:35).</p>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
          {success}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Adding…" : "Add track"}
      </button>
    </form>
  );
}

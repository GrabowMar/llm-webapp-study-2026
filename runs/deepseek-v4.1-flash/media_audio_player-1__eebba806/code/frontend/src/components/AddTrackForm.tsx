import { useState } from "react";
import { api, ApiError } from "../api";
import type { Session, Track } from "../types";

interface Props {
  session: Session;
  onCreated: () => void;
}

const EMPTY = { title: "", artist: "", url: "", duration: "" };

export default function AddTrackForm({ session, onCreated }: Props) {
  const [form, setForm] = useState(EMPTY);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  const update = (key: keyof typeof EMPTY) => (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setForm((current) => ({ ...current, [key]: event.target.value }));
    setFields((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
    setError("");
    setSuccess("");
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setFields({});
    setSuccess("");
    try {
      const track: Track = await api.createTrack(session.token, form);
      setForm(EMPTY);
      setSuccess(`Added "${track.title}".`);
      onCreated();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFields(err.fields);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  const inputClass =
    "mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600 focus:border-indigo-500";

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-lg">
      <h2 className="text-base font-semibold text-white">Add a track</h2>
      <p className="mt-0.5 text-xs text-slate-400">
        Link to an audio file hosted anywhere public. Only the link is stored.
      </p>

      <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="track-title" className="text-xs font-medium text-slate-400">
            Title
          </label>
          <input
            id="track-title"
            value={form.title}
            onChange={update("title")}
            placeholder="Song title"
            className={inputClass}
          />
          {fields.title && <p className="mt-1 text-xs text-rose-400">{fields.title}</p>}
        </div>

        <div>
          <label htmlFor="track-artist" className="text-xs font-medium text-slate-400">
            Artist
          </label>
          <input
            id="track-artist"
            value={form.artist}
            onChange={update("artist")}
            placeholder="Artist name"
            className={inputClass}
          />
          {fields.artist && <p className="mt-1 text-xs text-rose-400">{fields.artist}</p>}
        </div>

        <div>
          <label
            htmlFor="track-duration"
            className="text-xs font-medium text-slate-400"
          >
            Duration <span className="text-slate-600">(seconds, optional)</span>
          </label>
          <input
            id="track-duration"
            value={form.duration}
            onChange={update("duration")}
            placeholder="e.g. 214 or 3:34"
            inputMode="numeric"
            className={inputClass}
          />
          {fields.duration && (
            <p className="mt-1 text-xs text-rose-400">{fields.duration}</p>
          )}
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="track-url" className="text-xs font-medium text-slate-400">
            Audio URL
          </label>
          <input
            id="track-url"
            value={form.url}
            onChange={update("url")}
            placeholder="https://example.com/song.mp3"
            className={inputClass}
          />
          {fields.url && <p className="mt-1 text-xs text-rose-400">{fields.url}</p>}
        </div>

        {error && (
          <p className="sm:col-span-2 rounded-lg border border-rose-900/60 bg-rose-950/40 px-3 py-2 text-xs text-rose-300">
            {error}
          </p>
        )}
        {success && (
          <p className="sm:col-span-2 rounded-lg border border-emerald-900/60 bg-emerald-950/40 px-3 py-2 text-xs text-emerald-300">
            {success}
          </p>
        )}

        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Adding..." : "Add track"}
          </button>
        </div>
      </form>
    </section>
  );
}

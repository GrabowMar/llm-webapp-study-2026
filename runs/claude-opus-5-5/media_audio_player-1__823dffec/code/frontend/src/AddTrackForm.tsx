import { useState, type FormEvent } from "react";
import { ApiError, api, type Track } from "./api";

interface Props {
  onAdded: (track: Track) => void;
}

const inputClass =
  "w-full rounded-md border bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1";

function fieldClass(hasError: boolean) {
  return `${inputClass} ${
    hasError
      ? "border-rose-500 focus:border-rose-400 focus:ring-rose-400"
      : "border-slate-600 focus:border-indigo-400 focus:ring-indigo-400"
  }`;
}

export default function AddTrackForm({ onAdded }: Props) {
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [url, setUrl] = useState("");
  const [duration, setDuration] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    setSuccess(null);
    try {
      const track = await api.addTrack({
        title,
        artist,
        url,
        duration: duration.trim() === "" ? null : duration.trim(),
      });
      setTitle("");
      setArtist("");
      setUrl("");
      setDuration("");
      setSuccess(`Added “${track.title}”`);
      onAdded(track);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFieldErrors(err.errors);
      } else {
        setError("Something went wrong");
      }
    } finally {
      setBusy(false);
    }
  };

  const fields: { key: string; label: string; value: string; set: (v: string) => void; placeholder: string; type?: string }[] = [
    { key: "title", label: "Title", value: title, set: setTitle, placeholder: "Song title" },
    { key: "artist", label: "Artist", value: artist, set: setArtist, placeholder: "Artist name" },
    { key: "url", label: "Audio URL", value: url, set: setUrl, placeholder: "https://example.com/song.mp3", type: "url" },
    { key: "duration", label: "Duration (seconds or m:ss, optional)", value: duration, set: setDuration, placeholder: "3:45" },
  ];

  return (
    <section className="rounded-xl border border-slate-700 bg-slate-800/60 p-5">
      <h2 className="mb-3 text-lg font-semibold text-slate-100">Add a track</h2>
      <form onSubmit={submit} className="space-y-3" noValidate>
        {fields.map((f) => (
          <div key={f.key}>
            <label htmlFor={`track-${f.key}`} className="mb-1 block text-xs font-medium text-slate-400">
              {f.label}
            </label>
            <input
              id={`track-${f.key}`}
              name={f.key}
              type={f.type ?? "text"}
              className={fieldClass(Boolean(fieldErrors[f.key]))}
              value={f.value}
              placeholder={f.placeholder}
              aria-invalid={Boolean(fieldErrors[f.key])}
              onChange={(e) => f.set(e.target.value)}
            />
            {fieldErrors[f.key] && <p className="mt-1 text-xs text-rose-400">{fieldErrors[f.key]}</p>}
          </div>
        ))}
        {error && (
          <p role="alert" className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
            {error}
          </p>
        )}
        {success && (
          <p role="status" className="text-sm text-emerald-400">
            {success}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50"
        >
          {busy ? "Adding…" : "Add track"}
        </button>
      </form>
    </section>
  );
}

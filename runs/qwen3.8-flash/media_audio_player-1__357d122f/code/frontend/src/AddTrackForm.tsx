import { useState, type FormEvent, type JSX } from "react";
import { ApiError, api } from "./api";

interface Props {
  token: string;
  onAdded: () => void;
}

export default function AddTrackForm({ token, onAdded }: Props): JSX.Element {
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [url, setUrl] = useState("");
  const [duration, setDuration] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(true);

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setFormError(null);
    try {
      const dur = parseFloat(duration);
      await api.addTrack(token, { title, artist, url, duration: dur });
      setTitle("");
      setArtist("");
      setUrl("");
      setDuration("");
      onAdded();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields);
        setFormError(err.fields.url ?? err.message);
      } else {
        setFormError("network error, please try again");
      }
    } finally {
      setBusy(false);
    }
  }

  const inputCls = (name: string) =>
    `w-full rounded-md border px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 ${
      errors[name]
        ? "border-red-400 focus:border-red-500 focus:ring-red-100"
        : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-200"
    } bg-white`;

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-5 py-3 text-left"
      >
        <h2 className="text-sm font-semibold text-slate-800">Add a track</h2>
        <span className="text-slate-400">{open ? "▴" : "▾"}</span>
      </button>

      {open && (
        <form onSubmit={submit} className="grid gap-4 border-t border-slate-100 px-5 py-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="f-title">
              Title
            </label>
            <input id="f-title" className={inputCls("title")} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Track title" />
            {errors.title && <p className="mt-1 text-xs text-red-600">{errors.title}</p>}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="f-artist">
              Artist
            </label>
            <input id="f-artist" className={inputCls("artist")} value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="Artist name" />
            {errors.artist && <p className="mt-1 text-xs text-red-600">{errors.artist}</p>}
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="f-url">
              Audio URL (http/https)
            </label>
            <input id="f-url" className={inputCls("url")} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/song.mp3" />
            {errors.url && <p className="mt-1 text-xs text-red-600">{errors.url}</p>}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="f-duration">
              Duration (seconds)
            </label>
            <input id="f-duration" className={inputCls("duration")} value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="180" inputMode="decimal" />
            {errors.duration && <p className="mt-1 text-xs text-red-600">{errors.duration}</p>}
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? "Adding…" : "Add track"}
            </button>
          </div>
          {formError && <p className="text-sm text-red-600 sm:col-span-2">{formError}</p>}
        </form>
      )}
    </section>
  );
}

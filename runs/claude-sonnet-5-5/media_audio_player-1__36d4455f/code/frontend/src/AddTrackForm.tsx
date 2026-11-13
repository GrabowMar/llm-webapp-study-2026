import { FormEvent, useState } from "react";
import { api, ApiError, Track } from "./api";
import { buttonClass, FieldError, inputClass } from "./AuthForm";

function parseDuration(raw: string): number | undefined | null {
  const text = raw.trim();
  if (!text) return undefined;
  const parts = text.split(":");
  if (parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return null;
  return parts.reduce((acc, p) => acc * 60 + Number(p), 0);
}

export default function AddTrackForm({ onAdded }: { onAdded: (t: Track) => void }) {
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [url, setUrl] = useState("");
  const [duration, setDuration] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const d = parseDuration(duration);
    if (d === null) {
      setFields({ duration: "Duration must be seconds or m:ss" });
      return;
    }
    setFields({});
    setBusy(true);
    try {
      const track = await api.addTrack({ title, artist, url, ...(d !== undefined ? { duration: d } : {}) });
      setTitle("");
      setArtist("");
      setUrl("");
      setDuration("");
      onAdded(track);
    } catch (err) {
      if (err instanceof ApiError) {
        setFields(err.fields);
        if (!Object.keys(err.fields).length) setError(err.message);
      } else {
        setError("Something went wrong");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} aria-label="Add track" className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">Add a track</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <input className={inputClass} placeholder="Title" aria-label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <FieldError message={fields.title} />
        </div>
        <div>
          <input className={inputClass} placeholder="Artist" aria-label="Artist" value={artist} onChange={(e) => setArtist(e.target.value)} />
          <FieldError message={fields.artist} />
        </div>
        <div>
          <input className={inputClass} placeholder="Audio URL (http or https)" aria-label="URL" value={url} onChange={(e) => setUrl(e.target.value)} />
          <FieldError message={fields.url} />
        </div>
        <div>
          <input className={inputClass} placeholder="Duration (seconds or m:ss, optional)" aria-label="Duration" value={duration} onChange={(e) => setDuration(e.target.value)} />
          <FieldError message={fields.duration} />
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button className={buttonClass} disabled={busy} type="submit">
          Add track
        </button>
        <FieldError message={error} />
      </div>
    </form>
  );
}

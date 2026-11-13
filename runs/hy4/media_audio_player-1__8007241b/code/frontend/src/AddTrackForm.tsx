import { useState, type FormEvent } from "react";
import { api, errorFields, errorMessage } from "./api";
import type { Track } from "./api";
import Icon from "./Icon";

interface AddTrackFormProps {
  onAdded: (track: Track) => void;
}

const EMPTY = { title: "", artist: "", url: "", duration: "" };

export default function AddTrackForm({ onAdded }: AddTrackFormProps) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  function update(key: keyof typeof EMPTY, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
    setFieldErrors((e) => {
      if (!e[key]) return e;
      const next = { ...e };
      delete next[key];
      return next;
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError("");
    setSuccess("");
    setFieldErrors({});
    setBusy(true);
    try {
      const raw = values.duration.trim();
      const duration: number | string =
        raw === "" ? 0 : /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw;
      const track = await api.addTrack({
        title: values.title,
        artist: values.artist,
        url: values.url,
        duration,
      });
      onAdded(track);
      setValues(EMPTY);
      setSuccess("Track added to the library.");
      setOpen(false);
    } catch (err) {
      setFieldErrors(errorFields(err));
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-500"
      >
        <Icon name="plus" className="h-4 w-4" /> Add track
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-xl"
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-white">Add a track</h2>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setFieldErrors({});
            setFormError("");
          }}
          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-white"
          aria-label="Close add-track form"
        >
          <Icon name="close" className="h-4 w-4" />
        </button>
      </div>
      <p className="mb-4 text-xs text-slate-400">
        Tracks are links to audio files — the app never stores the audio itself.
        Only http/https addresses are accepted.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Title" value={values.title} onChange={(v) => update("title", v)} error={fieldErrors.title} />
        <Field label="Artist" value={values.artist} onChange={(v) => update("artist", v)} error={fieldErrors.artist} />
        <Field
          label="Audio URL"
          value={values.url}
          onChange={(v) => update("url", v)}
          error={fieldErrors.url}
          placeholder="https://example.com/song.mp3"
          className="sm:col-span-2"
        />
        <Field
          label="Duration (seconds or m:ss)"
          value={values.duration}
          onChange={(v) => update("duration", v)}
          error={fieldErrors.duration}
          placeholder="3:45"
        />
      </div>
      {formError && !Object.keys(fieldErrors).length && (
        <p className="mt-3 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          {formError}
        </p>
      )}
      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:opacity-60"
        >
          {busy ? "Adding…" : "Add track"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg px-4 py-2 text-sm font-medium text-slate-400 transition hover:text-white"
        >
          Cancel
        </button>
      </div>
      {success && <p className="mt-3 text-sm text-emerald-400">{success}</p>}
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  error,
  placeholder,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  placeholder?: string;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium text-slate-300">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-lg border bg-slate-950/70 px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-600 focus:ring-2 focus:ring-violet-500/40 ${
          error ? "border-rose-500" : "border-slate-700 focus:border-violet-500"
        }`}
      />
      {error && <span className="mt-1 block text-xs text-rose-400">{error}</span>}
    </label>
  );
}

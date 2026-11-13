import { useRef, useState } from "react";
import * as api from "../lib/api";
import { formatBytes } from "../lib/format";

interface Props {
  token: string;
  onUploaded: () => void;
}

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm " +
  "focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200";

const buttonClass =
  "rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm " +
  "hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50";

export default function UploadForm({ token, onUploaded }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function selectFile(next: File | null) {
    setError(null);
    if (!next) {
      setFile(null);
      setPreview(null);
      return;
    }
    const accepted =
      next.type === "image/png" ||
      next.type === "image/jpeg" ||
      (!next.type && /\.(png|jpe?g)$/i.test(next.name));
    if (!accepted) {
      setFile(null);
      setPreview(null);
      setError("Only PNG and JPEG images can be uploaded.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPreview(String(reader.result));
    reader.readAsDataURL(next);
    setFile(next);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!file) {
      setError("Choose a PNG or JPEG image first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",", 2)[1] ?? "");
        reader.onerror = () => reject(new Error("Could not read the selected file."));
        reader.readAsDataURL(file);
      });
      await api.createImage(token, {
        filename: file.name,
        data,
        title: title.trim() || undefined,
      });
      setFile(null);
      setPreview(null);
      setTitle("");
      if (inputRef.current) inputRef.current.value = "";
      onUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200"
    >
      <h2 className="text-lg font-semibold text-slate-900">Upload an image</h2>
      <p className="mt-1 text-sm text-slate-500">PNG or JPEG only.</p>

      <div className="mt-4 flex flex-wrap items-start gap-4">
        {preview ? (
          <img
            src={preview}
            alt="Preview of the selected image"
            className="h-28 w-28 rounded-xl border border-slate-200 object-cover"
          />
        ) : (
          <div className="flex h-28 w-28 items-center justify-center rounded-xl border border-dashed border-slate-300 text-xs text-slate-400">
            Preview
          </div>
        )}
        <div className="min-w-56 flex-1">
          <label className="block text-sm font-medium text-slate-700">
            Image file
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg"
              className="mt-1 block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100"
              onChange={(e) => selectFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <label className="mt-3 block text-sm font-medium text-slate-700">
            Title (optional)
            <input
              className={`${inputClass} mt-1`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Shown instead of the filename"
            />
          </label>
          {file && (
            <p className="mt-2 text-xs text-slate-500">
              {file.name} — {formatBytes(file.size)}
            </p>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <button type="submit" className={`${buttonClass} mt-4`} disabled={busy || !file}>
        {busy ? "Uploading…" : "Upload"}
      </button>
    </form>
  );
}

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { ApiError, uploadImage } from "../api";
import { formatBytes } from "../utils";

const MAX_BYTES = 16 * 1024 * 1024;
const ALLOWED_TYPES = ["image/png", "image/jpeg"];

interface Props {
  token: string;
  onUploaded: () => void;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.readAsDataURL(file);
  });
}

export function UploadForm({ token, onUploaded }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    let active = true;
    readFileAsDataUrl(file)
      .then((url) => {
        if (active) setPreview(url);
      })
      .catch(() => {
        if (active) setError("Could not read the selected file.");
      });
    return () => {
      active = false;
    };
  }, [file]);

  function pickFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setError(null);
    if (!selected) {
      setFile(null);
      return;
    }
    if (!ALLOWED_TYPES.includes(selected.type)) {
      setError("Only PNG and JPEG images are supported.");
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    if (selected.size > MAX_BYTES) {
      setError("The image is too large (16 MB maximum).");
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setFile(selected);
  }

  function reset() {
    setFile(null);
    setTitle("");
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !preview) {
      setError("Choose a PNG or JPEG image first.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const comma = preview.indexOf(",");
      const base64 = comma >= 0 ? preview.slice(comma + 1) : preview;
      await uploadImage(token, {
        filename: file.name,
        data: base64,
        ...(title.trim() ? { title: title.trim() } : {}),
      });
      reset();
      onUploaded();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Upload failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl">
      <h2 className="mb-1 text-lg font-semibold">Upload an image</h2>
      <p className="mb-5 text-sm text-slate-400">PNG or JPEG, up to {formatBytes(MAX_BYTES)}.</p>

      <form onSubmit={submit} className="space-y-4">
        <label
          htmlFor="upload-file"
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-700 bg-slate-950/50 px-4 py-6 text-center transition hover:border-indigo-500/70"
        >
          <span className="text-sm font-medium text-slate-300">
            {file ? file.name : "Click to choose an image"}
          </span>
          <span className="text-xs text-slate-500">
            {file ? `${formatBytes(file.size)} · ${file.type}` : "PNG or JPEG only"}
          </span>
          <input
            ref={inputRef}
            id="upload-file"
            type="file"
            accept="image/png,image/jpeg,.png,.jpg,.jpeg"
            onChange={pickFile}
            className="sr-only"
          />
        </label>

        {preview && (
          <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
            <img src={preview} alt="Selected image preview" className="h-48 w-full object-contain" />
          </div>
        )}

        <div>
          <label htmlFor="upload-title" className="mb-1 block text-sm font-medium text-slate-300">
            Title <span className="font-normal text-slate-500">(optional)</span>
          </label>
          <input
            id="upload-title"
            type="text"
            value={title}
            maxLength={255}
            onChange={(event) => setTitle(event.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none placeholder:text-slate-600 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30"
            placeholder="A caption for your image"
          />
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={busy || !file}
            className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Uploading…" : "Upload"}
          </button>
          {file && (
            <button
              type="button"
              onClick={reset}
              className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-slate-800"
            >
              Clear
            </button>
          )}
        </div>
      </form>
    </section>
  );
}

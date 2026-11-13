import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { api, ApiError, formatBytes, type Image } from "../api";

const ALLOWED = ["image/png", "image/jpeg"];
const MAX_BYTES = 10 * 1024 * 1024;

interface Props {
  token: string;
  onUploaded: (image: Image) => void;
  onUnauthorized: () => void;
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

export default function UploadForm({ token, onUploaded, onUnauthorized }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    setError(null);
    setSuccess(null);
    const f = e.target.files?.[0] ?? null;
    if (f && !ALLOWED.includes(f.type)) {
      setFile(null);
      setError("Only PNG and JPEG images can be uploaded.");
      e.target.value = "";
      return;
    }
    if (f && f.size > MAX_BYTES) {
      setFile(null);
      setError(`The file is too large (${formatBytes(f.size)}); the maximum is 10 MB.`);
      e.target.value = "";
      return;
    }
    setFile(f);
  }

  function reset() {
    setFile(null);
    setTitle("");
    if (inputRef.current) inputRef.current.value = "";
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Choose an image first.");
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const data = await readAsBase64(file);
      const image = await api.uploadImage(token, file.name, data, title.trim() || undefined);
      reset();
      setSuccess(`Uploaded “${image.title ?? image.filename}”.`);
      onUploaded(image);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) onUnauthorized();
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 text-base font-semibold text-slate-900">Upload an image</h2>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label htmlFor="upload-file" className="mb-1 block text-sm font-medium text-slate-700">
            Image (PNG or JPEG)
          </label>
          <input
            ref={inputRef}
            id="upload-file"
            type="file"
            accept="image/png,image/jpeg,.png,.jpg,.jpeg"
            onChange={onFileChange}
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100"
          />
        </div>
        {preview && file && (
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
            <img src={preview} alt="Preview" className="mx-auto max-h-56 w-auto object-contain" />
            <p className="truncate border-t border-slate-200 px-3 py-1.5 text-xs text-slate-500">
              {file.name} · {formatBytes(file.size)}
            </p>
          </div>
        )}
        <div>
          <label htmlFor="upload-title" className="mb-1 block text-sm font-medium text-slate-700">
            Title <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <input
            id="upload-title"
            value={title}
            maxLength={200}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:outline-none"
          />
        </div>
        {error && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        {success && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{success}</p>}
        <button
          type="submit"
          disabled={busy || !file}
          className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Uploading…" : "Upload"}
        </button>
      </form>
    </section>
  );
}

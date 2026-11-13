import { useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError, formatBytes, readFileAsBase64, uploadImage, type Image } from "../api";

const ACCEPTED = ["image/png", "image/jpeg"];
const MAX_BYTES = 20 * 1024 * 1024;

interface Props {
  token: string;
  onUploaded: (image: Image) => void;
}

export default function UploadForm({ token, onUploaded }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
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

  function chooseFile(candidate: File | undefined | null) {
    setNotice(null);
    if (!candidate) return;
    if (!ACCEPTED.includes(candidate.type)) {
      setError("Please choose a PNG or JPEG image.");
      setFile(null);
      return;
    }
    if (candidate.size > MAX_BYTES) {
      setError(`File is too large (${formatBytes(candidate.size)}). Maximum is 20 MB.`);
      setFile(null);
      return;
    }
    setError(null);
    setFile(candidate);
    if (!title) setTitle(candidate.name.replace(/\.(png|jpe?g)$/i, ""));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Please choose a file first.");
      return;
    }
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const data = await readFileAsBase64(file);
      const image = await uploadImage(token, file.name, data, title.trim() || null);
      onUploaded(image);
      setNotice(`Uploaded “${image.filename}”.`);
      setFile(null);
      setTitle("");
      if (inputRef.current) inputRef.current.value = "";
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
    >
      <h2 className="mb-3 text-base font-semibold text-slate-800">Upload an image</h2>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          chooseFile(e.dataTransfer.files?.[0]);
        }}
        className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-6 text-center transition ${
          dragOver ? "border-indigo-500 bg-indigo-50" : "border-slate-300 bg-slate-50"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg"
          className="hidden"
          onChange={(e) => chooseFile(e.target.files?.[0])}
        />
        {preview ? (
          <img
            src={preview}
            alt="Preview"
            className="mb-3 max-h-48 rounded-md object-contain shadow"
          />
        ) : (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mb-2 h-10 w-10 text-slate-400"
            aria-hidden="true"
          >
            <rect x="2.5" y="4.5" width="19" height="15" rx="2" />
            <circle cx="8.5" cy="10" r="1.5" />
            <path d="M2.5 17l6-5 4 3 4-4 5 4.5" />
          </svg>
        )}
        <p className="text-sm text-slate-600">
          {file ? `${file.name} (${formatBytes(file.size)})` : "PNG or JPEG, up to 20 MB"}
        </p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          {file ? "Change file" : "Choose file"}
        </button>
      </div>
      <div className="mt-3">
        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="title">
          Title <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="A short title"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
        />
      </div>
      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>
      )}
      <button
        type="submit"
        disabled={busy || !file}
        className="mt-3 w-full rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Uploading…" : "Upload"}
      </button>
    </form>
  );
}

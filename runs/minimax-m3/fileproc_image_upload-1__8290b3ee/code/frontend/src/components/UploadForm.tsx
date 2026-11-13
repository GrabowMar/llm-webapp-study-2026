import { useEffect, useRef, useState } from "react";
import { ApiError, uploadImage } from "../api";

interface UploadFormProps {
  token: string;
  onUploaded: () => void;
}

const ACCEPTED_TYPES = ["image/png", "image/jpeg"];
const ACCEPTED_EXTENSIONS = [".png", ".jpg", ".jpeg"];

export default function UploadForm({ token, onUploaded }: UploadFormProps) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const selected = event.target.files?.[0] ?? null;
    if (!selected) {
      setFile(null);
      return;
    }
    if (!isAccepted(selected)) {
      setFile(null);
      setError("Only PNG and JPEG images can be uploaded.");
      if (inputRef.current) {
        inputRef.current.value = "";
      }
      return;
    }
    setFile(selected);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError("Choose a PNG or JPEG image to upload.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const data = await readAsBase64(file);
      await uploadImage(token, {
        filename: file.name,
        data,
        ...(title.trim() ? { title: title.trim() } : {}),
      });
      setFile(null);
      setTitle("");
      if (inputRef.current) {
        inputRef.current.value = "";
      }
      onUploaded();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "The upload failed. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
    >
      <h2 className="text-lg font-semibold text-slate-900">Upload an image</h2>
      <p className="mt-1 text-sm text-slate-500">PNG or JPEG, up to 32 MB.</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="image-file"
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Image
          </label>
          <input
            ref={inputRef}
            id="image-file"
            name="file"
            type="file"
            accept={[...ACCEPTED_TYPES, ...ACCEPTED_EXTENSIONS].join(",")}
            onChange={handleFileChange}
            className="block w-full cursor-pointer rounded-lg border border-slate-300 text-sm text-slate-600 file:mr-3 file:cursor-pointer file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
          />
        </div>

        <div>
          <label
            htmlFor="image-title"
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Title <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <input
            id="image-title"
            name="title"
            type="text"
            value={title}
            maxLength={200}
            onChange={(event) => setTitle(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            placeholder="A short description"
          />
        </div>
      </div>

      {previewUrl ? (
        <div className="mt-4 flex items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <img
            src={previewUrl}
            alt="Selected image preview"
            className="h-20 w-20 shrink-0 rounded-lg object-cover"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-800">
              {file?.name}
            </p>
            <p className="text-xs text-slate-500">
              {file ? formatBytes(file.size) : ""}
            </p>
          </div>
        </div>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy || !file}
        className="mt-4 w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        {busy ? "Uploading…" : "Upload"}
      </button>
    </form>
  );
}

function isAccepted(file: File): boolean {
  if (ACCEPTED_TYPES.includes(file.type)) {
    return true;
  }
  const name = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((extension) => name.endsWith(extension));
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("The file could not be read."));
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

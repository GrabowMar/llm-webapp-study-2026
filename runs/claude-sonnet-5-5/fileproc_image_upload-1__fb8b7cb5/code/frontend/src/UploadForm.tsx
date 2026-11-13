import { useEffect, useState } from "react";
import { Image, readAsBase64, request } from "./api";

interface Props {
  token: string;
  onUploaded: () => void;
  onClose: () => void;
}

const ACCEPTED = ["image/png", "image/jpeg"];

export default function UploadForm({ token, onUploaded, onClose }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function choose(f: File | null) {
    setError(null);
    if (f && !ACCEPTED.includes(f.type)) {
      setFile(null);
      setError("Only PNG and JPEG images can be uploaded");
      return;
    }
    setFile(f);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Choose an image first");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const data = await readAsBase64(file);
      await request<Image>("/images", {
        method: "POST",
        token,
        body: { filename: file.name, data, title: title.trim() || undefined },
      });
      onUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg" aria-label="Upload image">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Upload an image</h2>
        <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-800" aria-label="Close">
          ✕
        </button>
      </div>
      <label className="mb-3 block text-sm font-medium">
        Image (PNG or JPEG)
        <input
          type="file"
          accept="image/png,image/jpeg"
          onChange={(e) => choose(e.target.files?.[0] ?? null)}
          className="mt-1 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm hover:file:bg-slate-200"
        />
      </label>
      {preview && <img src={preview} alt="Preview" className="mb-3 max-h-60 w-full rounded-md bg-slate-100 object-contain" />}
      <label className="mb-3 block text-sm font-medium">
        Title (optional)
        <input
          value={title}
          maxLength={200}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </label>
      {error && (
        <p role="alert" className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50">
        {busy ? "Uploading…" : "Upload"}
      </button>
    </form>
  );
}

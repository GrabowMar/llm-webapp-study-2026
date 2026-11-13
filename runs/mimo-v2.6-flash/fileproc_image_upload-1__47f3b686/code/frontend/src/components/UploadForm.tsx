import { useRef, useState } from "react";
import { ApiError, createImage, type Session } from "../api";

interface Props {
  session: Session;
  onUploaded: () => void;
  onAuthError: (message: string) => void;
}

const inputClass =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200";

function hasImageSignature(bytes: Uint8Array): boolean {
  const png =
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;
  const jpeg =
    bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  return png || jpeg;
}

function stripDataUrl(value: string): string {
  const comma = value.indexOf(",");
  return comma >= 0 ? value.slice(comma + 1) : value;
}

export default function UploadForm({ session, onUploaded, onAuthError }: Props) {
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [base64, setBase64] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const resetFile = () => {
    setPreviewUrl(null);
    setFileName(null);
    setBase64(null);
    setTitle("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setPreviewUrl(null);
    setFileName(null);
    setBase64(null);
    const file = event.target.files?.[0];
    if (!file) return;

    const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    if (!hasImageSignature(head)) {
      setError("Only PNG and JPEG images are supported.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      setPreviewUrl(result);
      setBase64(stripDataUrl(result));
      setFileName(file.name);
    };
    reader.onerror = () => setError("Could not read the selected file.");
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!base64 || !fileName) {
      setError("Choose a PNG or JPEG image first.");
      return;
    }
    setBusy(true);
    try {
      await createImage(
        { filename: fileName, data: base64, title: title.trim() || undefined },
        session,
      );
      resetFile();
      onUploaded();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onAuthError("Your session expired. Please sign in again.");
      } else {
        setError(err instanceof Error ? err.message : "Upload failed.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
      aria-label="Upload an image"
    >
      <div>
        <h2 className="text-base font-semibold text-slate-900">
          Upload an image
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          PNG or JPEG files only. The format is detected from the file content.
        </p>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      <div>
        <label
          htmlFor="upload-file"
          className="block text-sm font-medium text-slate-700"
        >
          Image file
        </label>
        <input
          id="upload-file"
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg"
          onChange={handleFileChange}
          className="mt-1 block w-full cursor-pointer rounded-lg border border-slate-300 bg-white text-sm text-slate-600 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
      </div>

      <div>
        <label
          htmlFor="upload-title"
          className="block text-sm font-medium text-slate-700"
        >
          Title <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <input
          id="upload-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="A short caption"
          className={inputClass}
        />
      </div>

      {previewUrl && (
        <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <img
            src={previewUrl}
            alt="Preview of the selected image"
            className="h-24 w-24 rounded-md border border-slate-200 bg-white object-cover"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-800">
              {fileName}
            </p>
            <p className="mt-1 text-xs text-slate-500">Preview</p>
            <button
              type="button"
              onClick={resetFile}
              className="mt-2 text-xs font-medium text-blue-600 hover:underline"
            >
              Remove file
            </button>
          </div>
        </div>
      )}

      <button
        type="submit"
        disabled={busy || !base64}
        className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
      >
        {busy ? "Uploading..." : "Upload"}
      </button>
    </form>
  );
}

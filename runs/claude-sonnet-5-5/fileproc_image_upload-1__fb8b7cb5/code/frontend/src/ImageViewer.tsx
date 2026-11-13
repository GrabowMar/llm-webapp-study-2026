import { useState } from "react";
import { Image, formatDate, formatSize, request } from "./api";

interface Props {
  image: Image;
  token: string | null;
  username: string | null;
  onClose: () => void;
  onDeleted: () => void;
}

export default function ImageViewer({ image, token, username, onClose, onDeleted }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const own = token !== null && username !== null && image.uploader.toLowerCase() === username.toLowerCase();

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await request(`/images/${image.id}`, { method: "DELETE", token });
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
      setBusy(false);
    }
  }

  return (
    <div className="flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold">{image.title || image.filename}</h2>
          <dl className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-600">
            <div>
              <dt className="inline font-medium">Filename: </dt>
              <dd className="inline break-all">{image.filename}</dd>
            </div>
            {image.title && (
              <div>
                <dt className="inline font-medium">Title: </dt>
                <dd className="inline">{image.title}</dd>
              </div>
            )}
            <div>
              <dt className="inline font-medium">Size: </dt>
              <dd className="inline">{formatSize(image.size_bytes)}</dd>
            </div>
            <div>
              <dt className="inline font-medium">Uploaded by </dt>
              <dd className="inline">
                {image.uploader} on {formatDate(image.uploaded_at)}
              </dd>
            </div>
          </dl>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-800" aria-label="Close">
          ✕
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-slate-100 p-2">
        <img src={image.url} alt={image.title || image.filename} className="max-h-[70vh] max-w-full object-contain" />
      </div>
      {own && (
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 px-5 py-3">
          {error && (
            <p role="alert" className="mr-auto text-sm text-red-700">
              {error}
            </p>
          )}
          {confirming ? (
            <>
              <span className="text-sm">Delete this image permanently?</span>
              <button disabled={busy} onClick={() => setConfirming(false)} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
                Cancel
              </button>
              <button disabled={busy} onClick={remove} className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50">
                {busy ? "Deleting…" : "Confirm delete"}
              </button>
            </>
          ) : (
            <button onClick={() => setConfirming(true)} className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500">
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

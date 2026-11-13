import { useEffect, useState } from "react";
import type { GalleryImage } from "../lib/api";
import { formatBytes, formatDate } from "../lib/format";

interface Props {
  image: GalleryImage;
  isOwner: boolean;
  error: string | null;
  busy: boolean;
  onClose: () => void;
  onDelete: () => void;
}

export default function ImageModal({ image, isOwner, error, busy, onClose, onDelete }: Props) {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={image.title ?? image.filename}
        onClick={(e) => e.stopPropagation()}
        className="relative max-h-full w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-full bg-white/90 px-3 py-1 text-lg font-medium text-slate-600 shadow ring-1 ring-slate-200 hover:bg-slate-100"
        >
          ×
        </button>

        <img
          src={image.url}
          alt={image.title ?? image.filename}
          className="mx-auto max-h-[60vh] w-auto rounded-xl object-contain"
        />

        <div className="mt-5">
          <h2 className="text-xl font-semibold text-slate-900">
            {image.title || image.filename}
          </h2>
          <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div className="flex gap-2">
              <dt className="text-slate-500">Filename</dt>
              <dd className="break-all font-medium text-slate-800">{image.filename}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-slate-500">Title</dt>
              <dd className="font-medium text-slate-800">{image.title || "—"}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-slate-500">Size</dt>
              <dd className="font-medium text-slate-800">{formatBytes(image.size_bytes)}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-slate-500">Type</dt>
              <dd className="font-medium text-slate-800">{image.content_type}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-slate-500">Uploaded by</dt>
              <dd className="font-medium text-slate-800">{image.uploader}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-slate-500">Uploaded</dt>
              <dd className="font-medium text-slate-800">{formatDate(image.uploaded_at)}</dd>
            </div>
          </dl>
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {isOwner && (
          <div className="mt-5 border-t border-slate-100 pt-4">
            {confirming ? (
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm font-medium text-slate-800">
                  Delete this image? This cannot be undone.
                </p>
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={busy}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700 disabled:opacity-50"
                >
                  {busy ? "Deleting…" : "Yes, delete"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={busy}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                Delete image
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

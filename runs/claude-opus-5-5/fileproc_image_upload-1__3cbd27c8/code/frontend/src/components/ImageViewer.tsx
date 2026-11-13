import { useEffect } from "react";
import { formatBytes, formatDate, type Image } from "../api";

interface Props {
  image: Image;
  canDelete: boolean;
  onDelete: () => void;
  onClose: () => void;
}

export default function ImageViewer({ image, canDelete, onDelete, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col bg-slate-950/90"
      role="dialog"
      aria-modal="true"
      aria-label={image.title ?? image.filename}
      onClick={onClose}
    >
      <div
        className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-slate-900 px-4 py-3 text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        <dl className="grid min-w-0 grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
          <dt className="text-slate-400">Title</dt>
          <dd className="truncate font-medium">{image.title ?? <span className="text-slate-500">—</span>}</dd>
          <dt className="text-slate-400">Filename</dt>
          <dd className="truncate">{image.filename}</dd>
          <dt className="text-slate-400">Size</dt>
          <dd>
            {formatBytes(image.size_bytes)} · {image.content_type}
          </dd>
          <dt className="text-slate-400">Uploaded</dt>
          <dd className="truncate">
            {formatDate(image.uploaded_at)} by {image.uploader}
          </dd>
        </dl>
        <div className="flex gap-2">
          {canDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-500"
            >
              Delete
            </button>
          )}
          <a
            href={image.url}
            target="_blank"
            rel="noreferrer"
            className="rounded-md bg-white/10 px-3 py-1.5 text-sm font-medium hover:bg-white/20"
          >
            Open original
          </a>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-white/10 px-3 py-1.5 text-sm font-medium hover:bg-white/20"
            aria-label="Close"
          >
            Close
          </button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
        <img
          src={image.url}
          alt={image.title ?? image.filename}
          className="max-h-full max-w-full object-contain"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    </div>
  );
}

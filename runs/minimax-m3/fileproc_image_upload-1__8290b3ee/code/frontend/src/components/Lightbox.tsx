import { useEffect } from "react";
import type { ImageItem } from "../types";

interface LightboxProps {
  image: ImageItem;
  onClose: () => void;
}

export default function Lightbox({ image, onClose }: LightboxProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={image.title ?? image.filename}
      className="fixed inset-0 z-50 flex flex-col bg-slate-950/90 p-4 sm:p-6"
      onClick={onClose}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 text-white">
          <h2 className="truncate text-lg font-semibold">
            {image.title || image.filename}
          </h2>
          <p className="mt-1 truncate text-sm text-slate-300">
            {image.filename}
            {image.title ? ` · ${image.title}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-lg bg-white/10 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-white/20"
        >
          Close
        </button>
      </div>

      <div className="mt-4 flex flex-1 items-center justify-center overflow-auto">
        <img
          src={image.url}
          alt={image.title ?? image.filename}
          className="max-h-full max-w-full rounded-xl object-contain shadow-2xl"
          onClick={(event) => event.stopPropagation()}
        />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-white/5 p-4 text-sm text-slate-200 sm:grid-cols-4">
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-400">
            Filename
          </dt>
          <dd className="mt-0.5 truncate font-medium">{image.filename}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-400">Title</dt>
          <dd className="mt-0.5 truncate font-medium">
            {image.title || "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-400">Size</dt>
          <dd className="mt-0.5 font-medium">{formatBytes(image.size_bytes)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-400">
            Uploaded
          </dt>
          <dd className="mt-0.5 font-medium">
            {new Date(image.uploaded_at).toLocaleString()}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

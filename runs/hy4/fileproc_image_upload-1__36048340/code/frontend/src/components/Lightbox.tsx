import { useEffect } from "react";
import type { GalleryImage } from "../api";
import { displayTitle, formatBytes, formatDate } from "../utils";

interface Props {
  image: GalleryImage;
  onClose: () => void;
}

export function Lightbox({ image, onClose }: Props) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={displayTitle(image.filename, image.title)}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 px-5 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-slate-100">
              {displayTitle(image.filename, image.title)}
            </h2>
            {image.title && image.title.trim() && (
              <p className="truncate text-xs text-slate-400">{image.filename}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 transition hover:bg-slate-800"
          >
            Close
          </button>
        </div>

        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-slate-950 p-4">
          <img
            src={image.url}
            alt={displayTitle(image.filename, image.title)}
            className="max-h-[70vh] max-w-full object-contain"
          />
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 border-t border-slate-800 px-5 py-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-slate-500">Filename</dt>
            <dd className="truncate text-slate-200" title={image.filename}>{image.filename}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Title</dt>
            <dd className="truncate text-slate-200" title={image.title ?? ""}>
              {image.title || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Size</dt>
            <dd className="text-slate-200">{formatBytes(image.size_bytes)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Uploaded</dt>
            <dd className="text-slate-200">
              {formatDate(image.uploaded_at)} · {image.uploader}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

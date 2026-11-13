import { useEffect, useState } from "react";
import {
  formatBytes,
  formatFullDate,
  type ImageItem,
  type Session,
} from "../api";

interface Props {
  image: ImageItem;
  session: Session | null;
  onClose: () => void;
  onDelete: (image: ImageItem) => void | Promise<void>;
}

export default function ImageDetail({ image, session, onClose, onDelete }: Props) {
  const [deleting, setDeleting] = useState(false);
  const canDelete = session !== null && session.username === image.uploader;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const handleDelete = async () => {
    if (deleting) return;
    const label = image.title || image.filename;
    if (!window.confirm(`Delete "${label}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await onDelete(image);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={image.title || image.filename}
        className="relative max-h-full w-full max-w-4xl overflow-y-auto rounded-xl bg-white p-4 shadow-xl sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 rounded-lg bg-slate-100 px-2.5 py-1 text-sm font-medium text-slate-600 hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          Close
        </button>

        <div className="flex justify-center bg-slate-900/5 p-2 sm:p-4">
          <img
            src={image.url}
            alt={image.title ?? image.filename}
            className="max-h-[65vh] w-auto max-w-full rounded-lg object-contain"
          />
        </div>

        <div className="mt-4">
          <h2 className="truncate pr-16 text-lg font-semibold text-slate-900">
            {image.title || image.filename}
          </h2>
          <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">Filename</dt>
              <dd className="font-medium text-slate-800 break-all">
                {image.filename}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Title</dt>
              <dd className="font-medium text-slate-800">
                {image.title || <span className="text-slate-400">None</span>}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Size</dt>
              <dd className="font-medium text-slate-800">
                {formatBytes(image.size_bytes)}
                <span className="ml-1 font-normal text-slate-400">
                  ({image.size_bytes} bytes)
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Uploader</dt>
              <dd className="font-medium text-slate-800">{image.uploader}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Uploaded</dt>
              <dd className="font-medium text-slate-800">
                {formatFullDate(image.uploaded_at)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Content type</dt>
              <dd className="font-medium text-slate-800">
                {image.content_type}
              </dd>
            </div>
          </dl>

          <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-200 pt-4">
            <a
              href={image.url}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium text-blue-600 hover:underline"
            >
              Open full size
            </a>
            {canDelete && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-300 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

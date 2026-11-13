import { useEffect } from "react";
import { formatBytes, type Image } from "../api";

interface Props {
  image: Image;
  onClose: () => void;
  onDelete: (id: number) => Promise<void>;
  canDelete: boolean;
}

export default function Lightbox({ image, onClose, onDelete, canDelete }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={image.title ?? image.filename}
      onClick={onClose}
    >
      <div
        className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            {image.title && (
              <h3 className="truncate text-lg font-semibold text-slate-800">{image.title}</h3>
            )}
            <p className="truncate text-sm text-slate-500">
              {image.filename} · {formatBytes(image.size_bytes)} · uploaded by {image.uploader}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="h-5 w-5"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-auto bg-slate-900/5 p-4">
          <img
            src={image.url}
            alt={image.title ?? image.filename}
            className="mx-auto max-h-[70vh] max-w-full rounded object-contain"
          />
        </div>
        {canDelete && (
          <div className="flex justify-end border-t border-slate-100 px-5 py-3">
            <DeleteButton
              onDelete={async () => {
                await onDelete(image.id);
                onClose();
              }}
              label={image.title ?? image.filename}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export function DeleteButton({
  onDelete,
  label,
}: {
  onDelete: () => Promise<void>;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        if (window.confirm(`Delete “${label}”? This cannot be undone.`)) {
          void onDelete();
        }
      }}
      className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
    >
      Delete
    </button>
  );
}

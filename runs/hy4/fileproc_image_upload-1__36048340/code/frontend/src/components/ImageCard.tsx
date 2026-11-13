import { useState } from "react";
import type { GalleryImage } from "../api";
import { deleteImage, type ApiError as ApiErrorType } from "../api";
import { displayTitle, formatDate } from "../utils";

interface Props {
  image: GalleryImage;
  username: string | null;
  token: string | null;
  onOpen: (image: GalleryImage) => void;
  onDeleted: () => void;
}

function isApiError(value: unknown): value is ApiErrorType {
  return value instanceof Error && value.name === "ApiError";
}

export function ImageCard({ image, username, token, onOpen, onDeleted }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const own = username !== null && image.uploader === username && token !== null;

  async function remove() {
    if (!token) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteImage(token, image.id);
      onDeleted();
    } catch (cause) {
      setError(isApiError(cause) ? cause.message : "Could not delete the image.");
      setConfirming(false);
      setDeleting(false);
    }
  }

  return (
    <article className="group overflow-hidden rounded-xl border border-slate-800 bg-slate-900 transition hover:border-slate-700 hover:shadow-lg hover:shadow-indigo-950/30">
      <button
        type="button"
        onClick={() => onOpen(image)}
        className="block w-full cursor-zoom-in bg-slate-950"
        aria-label={`View ${displayTitle(image.filename, image.title)} full size`}
      >
        <img
          src={image.url}
          alt={displayTitle(image.filename, image.title)}
          loading="lazy"
          className="aspect-4/3 w-full object-cover transition duration-300 group-hover:opacity-90"
        />
      </button>

      <div className="space-y-1 p-4">
        <h3 className="truncate font-semibold text-slate-100" title={displayTitle(image.filename, image.title)}>
          {displayTitle(image.filename, image.title)}
        </h3>
        {image.title && image.title.trim() && (
          <p className="truncate text-xs text-slate-500" title={image.filename}>
            {image.filename}
          </p>
        )}
        <div className="flex items-center justify-between gap-2 pt-1 text-xs text-slate-400">
          <span className="truncate" title={image.uploader}>
            by <span className="font-medium text-indigo-300">{image.uploader}</span>
          </span>
          <span className="shrink-0">{formatDate(image.uploaded_at)}</span>
        </div>

        {error && <p role="alert" className="text-xs text-red-300">{error}</p>}

        {own &&
          (confirming ? (
            <div className="flex items-center gap-2 pt-2">
              <span className="flex-1 text-xs text-slate-300">Delete this image?</span>
              <button
                type="button"
                disabled={deleting}
                onClick={remove}
                className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Confirm"}
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => setConfirming(false)}
                className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="mt-2 rounded-md border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-400 transition hover:border-red-500/60 hover:text-red-300"
            >
              Delete
            </button>
          ))}
      </div>
    </article>
  );
}

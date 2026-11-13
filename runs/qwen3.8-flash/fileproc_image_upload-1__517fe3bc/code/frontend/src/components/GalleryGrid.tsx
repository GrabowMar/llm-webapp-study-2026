import { formatDate, type Image } from "../api";
import { DeleteButton } from "./Lightbox";

interface Props {
  items: Image[];
  currentUsername: string | null;
  onOpen: (image: Image) => void;
  onDelete: (id: number) => Promise<void>;
  busy: boolean;
  error: string | null;
  empty: boolean;
}

export default function GalleryGrid({
  items,
  currentUsername,
  onOpen,
  onDelete,
  busy,
  error,
  empty,
}: Props) {
  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">
        {error}
      </div>
    );
  }
  if (busy && items.length === 0) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="aspect-square animate-pulse rounded-xl bg-slate-200" />
        ))}
      </div>
    );
  }
  if (empty) {
    return (
      <div className="rounded-xl border-2 border-dashed border-slate-200 bg-white p-10 text-center">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="mx-auto mb-3 h-10 w-10 text-slate-300"
          aria-hidden="true"
        >
          <rect x="2.5" y="4.5" width="19" height="15" rx="2" />
          <circle cx="8.5" cy="10" r="1.5" />
          <path d="M2.5 17l6-5 4 3 4-4 5 4.5" />
        </svg>
        <h3 className="text-base font-semibold text-slate-700">No images yet</h3>
        <p className="mt-1 text-sm text-slate-500">
          Sign in and upload the first PNG or JPEG to start the gallery.
        </p>
      </div>
    );
  }
  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {items.map((image) => (
        <li
          key={image.id}
          className="group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md"
        >
          <button
            type="button"
            onClick={() => onOpen(image)}
            className="block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            aria-label={`Open ${image.title ?? image.filename}`}
          >
            <div className="relative aspect-square overflow-hidden bg-slate-100">
              <img
                src={image.url}
                alt={image.title ?? image.filename}
                loading="lazy"
                className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
              />
            </div>
            <div className="px-3 py-2">
              <p className="truncate text-sm font-medium text-slate-800">
                {image.title ?? image.filename}
              </p>
              {image.title && (
                <p className="truncate text-xs text-slate-400">{image.filename}</p>
              )}
              <p className="mt-0.5 truncate text-xs text-slate-500">
                {image.uploader} · {formatDate(image.uploaded_at)}
              </p>
            </div>
          </button>
          {currentUsername && currentUsername === image.uploader && (
            <div className="flex justify-end border-t border-slate-100 px-3 py-2">
              <DeleteButton
                label={image.title ?? image.filename}
                onDelete={() => onDelete(image.id)}
              />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

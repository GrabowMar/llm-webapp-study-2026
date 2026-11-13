import type { GalleryImage } from "../lib/api";
import { formatDate } from "../lib/format";

interface Props {
  images: GalleryImage[];
  loading: boolean;
  error: string | null;
  onSelect: (image: GalleryImage) => void;
}

export default function Gallery({ images, loading, error, onSelect }: Props) {
  if (error) {
    return (
      <p role="alert" className="rounded-2xl bg-red-50 px-4 py-6 text-center text-sm text-red-700">
        {error}
      </p>
    );
  }
  if (loading && images.length === 0) {
    return <p className="py-12 text-center text-sm text-slate-500">Loading images…</p>;
  }
  if (images.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
        <p className="text-base font-medium text-slate-700">No images yet</p>
        <p className="mt-1 text-sm text-slate-500">
          Be the first to upload one — the gallery is empty.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {images.map((image) => (
        <button
          key={image.id}
          type="button"
          onClick={() => onSelect(image)}
          className="group overflow-hidden rounded-2xl bg-white text-left shadow-sm ring-1 ring-slate-200 transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <div className="aspect-square overflow-hidden bg-slate-100">
            <img
              src={image.url}
              alt={image.title ?? image.filename}
              loading="lazy"
              className="h-full w-full object-cover transition duration-200 group-hover:scale-105"
            />
          </div>
          <div className="p-3">
            <p className="truncate text-sm font-medium text-slate-900">
              {image.title || image.filename}
            </p>
            <p className="mt-0.5 truncate text-xs text-slate-500">by {image.uploader}</p>
            <p className="mt-0.5 text-xs text-slate-400">{formatDate(image.uploaded_at)}</p>
          </div>
        </button>
      ))}
    </div>
  );
}

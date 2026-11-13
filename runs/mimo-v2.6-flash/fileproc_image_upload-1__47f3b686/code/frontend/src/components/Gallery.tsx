import { formatShortDate, type ImageItem } from "../api";

interface Props {
  images: ImageItem[];
  loading: boolean;
  error: string | null;
  onOpen: (image: ImageItem) => void;
}

export default function Gallery({ images, loading, error, onOpen }: Props) {
  if (error) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-red-200 bg-red-50 px-4 py-8 text-center text-sm text-red-700"
      >
        {error}
      </div>
    );
  }

  if (loading && images.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-16 text-center text-sm text-slate-500">
        Loading images...
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-16 text-center">
        <p className="text-base font-medium text-slate-700">No images yet</p>
        <p className="mt-1 text-sm text-slate-500">
          Upload a PNG or JPEG to get started.
        </p>
      </div>
    );
  }

  return (
    <div
      className={`grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 ${
        loading ? "opacity-60" : ""
      }`}
    >
      {images.map((image) => (
        <button
          key={image.id}
          type="button"
          onClick={() => onOpen(image)}
          className="group overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-sm transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          <div className="aspect-square w-full bg-slate-100">
            <img
              src={image.url}
              alt={image.title ?? image.filename}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          </div>
          <div className="p-3">
            <p className="truncate text-sm font-medium text-slate-900">
              {image.title || image.filename}
            </p>
            <p className="mt-1 truncate text-xs text-slate-500">
              {image.uploader}
            </p>
            <p className="text-xs text-slate-400">
              {formatShortDate(image.uploaded_at)}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}

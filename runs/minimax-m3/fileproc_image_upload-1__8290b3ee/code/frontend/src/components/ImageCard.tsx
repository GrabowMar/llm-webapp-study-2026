import type { ImageItem } from "../types";

interface ImageCardProps {
  image: ImageItem;
  canDelete: boolean;
  onOpen: (image: ImageItem) => void;
  onDelete: (image: ImageItem) => void;
}

export default function ImageCard({
  image,
  canDelete,
  onOpen,
  onDelete,
}: ImageCardProps) {
  return (
    <figure className="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <button
        type="button"
        onClick={() => onOpen(image)}
        className="block aspect-square w-full overflow-hidden bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500"
        aria-label={`Open ${image.title ?? image.filename}`}
      >
        <img
          src={image.url}
          alt={image.title ?? image.filename}
          loading="lazy"
          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
        />
      </button>

      <figcaption className="flex flex-1 flex-col gap-1 p-3">
        <p className="truncate text-sm font-semibold text-slate-900">
          {image.title || image.filename}
        </p>
        {image.title ? (
          <p className="truncate text-xs text-slate-500">{image.filename}</p>
        ) : null}
        <p className="mt-auto flex items-center justify-between gap-2 pt-1 text-xs text-slate-500">
          <span className="truncate">by {image.uploader}</span>
          <time dateTime={image.uploaded_at} className="shrink-0">
            {formatDate(image.uploaded_at)}
          </time>
        </p>

        {canDelete ? (
          <button
            type="button"
            onClick={() => onDelete(image)}
            className="mt-2 rounded-lg border border-red-200 px-2 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50"
          >
            Delete
          </button>
        ) : null}
      </figcaption>
    </figure>
  );
}

function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

import { ApiError } from "../api";

export function ErrorMessage({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {message}
    </div>
  );
}

export function errorText(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Something went wrong.";
}

export function Stars({ rating }: { rating: number | null }) {
  if (rating === null) return <span className="text-slate-400">—</span>;
  return (
    <span className="inline-flex items-center gap-1" title={`${rating} / 5`}>
      <span className="text-amber-500" aria-hidden>
        {"★".repeat(Math.round(rating))}
        <span className="text-slate-300">
          {"★".repeat(5 - Math.round(rating))}
        </span>
      </span>
      <span className="text-sm text-slate-600">{rating.toFixed(1)}</span>
    </span>
  );
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

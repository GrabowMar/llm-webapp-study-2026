import type { Preview } from "../api";
import PreviewCard from "./PreviewCard";

interface Props {
  items: Preview[];
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  error: string | null;
  onPageChange: (page: number) => void;
  onRefresh: (id: number) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}

export default function PreviewList({
  items,
  total,
  page,
  pageSize,
  loading,
  error,
  onPageChange,
  onRefresh,
  onDelete,
}: Props) {
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <section className="space-y-4">
      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {loading && items.length === 0 && (
        <p className="py-8 text-center text-sm text-slate-500">Loading previews…</p>
      )}

      {!loading && items.length === 0 && !error && (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">
          No previews yet. Paste a link above to save one.
        </p>
      )}

      {items.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {items.map((preview) => (
            <PreviewCard
              key={preview.id}
              preview={preview}
              onRefresh={onRefresh}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}

      {pages > 1 && (
        <nav className="flex items-center justify-between gap-3" aria-label="Pagination">
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-sm text-slate-500">
            Page {page} of {pages}
          </span>
          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= pages}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </nav>
      )}
    </section>
  );
}

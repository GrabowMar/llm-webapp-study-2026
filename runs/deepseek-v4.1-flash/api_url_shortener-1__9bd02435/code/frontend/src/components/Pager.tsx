type Props = {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
};

export default function Pager({ page, pageSize, total, onPage }: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-slate-400">
      <span>
        Page {page} of {totalPages} &middot; {total} total
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          className="rounded-lg border border-slate-700 px-3 py-1.5 transition hover:border-indigo-500 disabled:opacity-40"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={() => onPage(page + 1)}
          disabled={page >= totalPages}
          className="rounded-lg border border-slate-700 px-3 py-1.5 transition hover:border-indigo-500 disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}

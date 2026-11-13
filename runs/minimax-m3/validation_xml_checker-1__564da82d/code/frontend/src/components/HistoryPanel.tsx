import type { SavedCheck } from "../api";

export type HistoryFilter = "all" | "valid" | "invalid";

interface Props {
  items: SavedCheck[];
  total: number;
  page: number;
  pageSize: number;
  filter: HistoryFilter;
  loading: boolean;
  onFilterChange: (filter: HistoryFilter) => void;
  onPageChange: (page: number) => void;
  onDelete: (id: number) => void;
}

function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function HistoryPanel({
  items,
  total,
  page,
  pageSize,
  filter,
  loading,
  onFilterChange,
  onPageChange,
  onDelete,
}: Props) {
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 shadow-xl shadow-black/20">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-100">History</h2>
        <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-300">
          {total} saved
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-1 rounded-lg bg-slate-800/60 p-1">
        {(
          [
            ["all", "All"],
            ["valid", "Valid"],
            ["invalid", "Invalid"],
          ] as [HistoryFilter, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => onFilterChange(value)}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition ${
              filter === value
                ? "bg-slate-950 text-slate-100 shadow"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">Loading…</p>
      ) : items.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-slate-800 px-3 py-6 text-center text-sm text-slate-500">
          No checks saved yet.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 transition hover:border-slate-700"
            >
              <div className="flex items-start justify-between gap-2">
                <span
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${
                    item.valid
                      ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/40"
                      : "bg-rose-500/15 text-rose-300 ring-1 ring-inset ring-rose-500/40"
                  }`}
                >
                  {item.valid ? "Valid" : "Invalid"}
                </span>
                <button
                  type="button"
                  onClick={() => onDelete(item.id)}
                  aria-label={`Delete check ${item.id}`}
                  className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-rose-500/15 hover:text-rose-300"
                >
                  Delete
                </button>
              </div>
              <p className="mt-2 max-h-16 overflow-hidden whitespace-pre-wrap break-all font-mono text-xs text-slate-400">
                {item.xml_preview}
                {item.xml_preview.length >= 200 && (
                  <span className="text-slate-600">…</span>
                )}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                {item.valid && item.root_element ? (
                  <span>
                    Root element <code className="text-sky-300">&lt;{item.root_element}&gt;</code>
                  </span>
                ) : (
                  <span>
                    <span className="text-rose-300">{item.error}</span>
                    {item.line !== null && item.column !== null && (
                      <span className="ml-1">
                        (line {item.line}, column {item.column})
                      </span>
                    )}
                  </span>
                )}
                <span className="ml-2 text-slate-600">{formatDate(item.created_at)}</span>
              </p>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex items-center justify-between text-sm">
        <button
          type="button"
          disabled={page <= 1 || loading}
          onClick={() => onPageChange(page - 1)}
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-slate-300 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Previous
        </button>
        <span className="text-slate-500">
          Page {page} of {pages}
        </span>
        <button
          type="button"
          disabled={page >= pages || loading}
          onClick={() => onPageChange(page + 1)}
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-slate-300 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </section>
  );
}

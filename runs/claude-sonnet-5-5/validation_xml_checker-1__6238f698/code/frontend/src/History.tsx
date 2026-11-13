import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type Page } from "./api";

const PAGE_SIZE = 5;

export default function History({
  token,
  refreshKey,
  onExpired,
}: {
  token: string;
  refreshKey: number;
  onExpired: () => void;
}) {
  const [filter, setFilter] = useState<boolean | null>(null);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.list(token, page, PAGE_SIZE, filter);
      const pages = Math.max(1, Math.ceil(res.total / PAGE_SIZE));
      if (page > pages) {
        setPage(pages);
        return;
      }
      setData(res);
      setErr(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) onExpired();
      else setErr(e instanceof ApiError ? e.message : "Could not load history");
    }
  }, [token, page, filter, onExpired]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  async function remove(id: number) {
    try {
      await api.remove(token, id);
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) onExpired();
      else setErr(e instanceof ApiError ? e.message : "Delete failed");
    }
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;
  const tab = (active: boolean) =>
    `rounded px-3 py-1 text-sm ${active ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-700 hover:bg-slate-300"}`;

  return (
    <section className="rounded-lg bg-white p-4 shadow" aria-label="Saved checks">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Saved checks</h2>
        <div className="flex gap-1" role="group" aria-label="Filter">
          {([
            ["All", null],
            ["Valid", true],
            ["Invalid", false],
          ] as const).map(([label, value]) => (
            <button
              key={label}
              className={tab(filter === value)}
              aria-pressed={filter === value}
              onClick={() => {
                setFilter(value);
                setPage(1);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {err && <p className="mb-2 text-sm text-red-700">{err}</p>}
      {data && data.items.length === 0 && (
        <p className="text-sm text-slate-500">No saved checks.</p>
      )}
      <ul className="divide-y divide-slate-200">
        {data?.items.map((item) => (
          <li key={item.id} className="flex items-start gap-3 py-2" data-testid="history-item">
            <span
              className={`mt-0.5 rounded px-2 py-0.5 text-xs font-medium ${item.valid ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}
            >
              {item.valid ? "Valid" : "Invalid"}
            </span>
            <div className="min-w-0 flex-1">
              <pre className="truncate font-mono text-xs text-slate-800">{item.xml_preview}</pre>
              <p className="text-xs text-slate-500">
                {item.valid
                  ? `Root: ${item.root_element ?? "-"}`
                  : `${item.error} (line ${item.line}, column ${item.column})`}
                {" · "}
                {new Date(item.created_at).toLocaleString()}
              </p>
            </div>
            <button
              className="text-sm text-red-700 hover:underline"
              onClick={() => void remove(item.id)}
              aria-label={`Delete check ${item.id}`}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center justify-between text-sm">
        <button
          className="rounded bg-slate-200 px-3 py-1 disabled:opacity-50"
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
        >
          Previous
        </button>
        <span>
          Page {page} of {pages}
          {data ? ` (${data.total} total)` : ""}
        </span>
        <button
          className="rounded bg-slate-200 px-3 py-1 disabled:opacity-50"
          disabled={page >= pages}
          onClick={() => setPage(page + 1)}
        >
          Next
        </button>
      </div>
    </section>
  );
}

import { useCallback, useEffect, useState } from "react";
import { api, type Page, type SavedCheck } from "../api";

interface Props {
  token: string;
  version: number;
  onAuthError: (err: unknown) => void;
}

type Filter = "all" | "valid" | "invalid";

const PAGE_SIZE = 10;

function formatDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export default function History({ token, version, onAuthError }: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<SavedCheck> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const valid = filter === "all" ? undefined : filter === "valid";
      const res = await api.list(token, { valid, page, pageSize: PAGE_SIZE });
      const lastPage = Math.max(1, Math.ceil(res.total / PAGE_SIZE));
      if (res.items.length === 0 && page > lastPage) {
        setPage(lastPage);
        return;
      }
      setData(res);
    } catch (err) {
      onAuthError(err);
      setError(err instanceof Error ? err.message : "Could not load history");
    } finally {
      setLoading(false);
    }
  }, [token, filter, page, onAuthError]);

  useEffect(() => {
    void load();
  }, [load, version]);

  const remove = async (id: number) => {
    setDeleting(id);
    try {
      await api.remove(token, id);
      await load();
    } catch (err) {
      onAuthError(err);
      setError(err instanceof Error ? err.message : "Could not delete");
    } finally {
      setDeleting(null);
    }
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  const filterButton = (f: Filter, label: string) => (
    <button
      type="button"
      onClick={() => {
        setFilter(f);
        setPage(1);
      }}
      aria-pressed={filter === f}
      className={`flex-1 rounded-md px-2 py-1 text-xs font-medium ${
        filter === f ? "bg-white shadow-sm" : "text-slate-500 hover:text-slate-800"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="space-y-3 border-b border-slate-200 p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Saved checks</h2>
          {data && <span className="text-xs text-slate-500">{data.total} total</span>}
        </div>
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1" role="group" aria-label="Filter saved checks">
          {filterButton("all", "All")}
          {filterButton("valid", "Valid")}
          {filterButton("invalid", "Invalid")}
        </div>
      </div>

      {error && <p role="alert" className="m-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <ul className={`divide-y divide-slate-100 ${loading ? "opacity-60" : ""}`}>
        {data?.items.map((item) => (
          <li key={item.id} className="space-y-1.5 px-4 py-3" data-testid="saved-check">
            <div className="flex items-center justify-between gap-2">
              {item.valid ? (
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">
                  Well-formed
                </span>
              ) : (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
                  Not well-formed
                </span>
              )}
              <button
                type="button"
                onClick={() => remove(item.id)}
                disabled={deleting === item.id}
                aria-label={`Delete saved check ${item.id}`}
                className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
              >
                Delete
              </button>
            </div>
            <p className="text-xs text-slate-600">
              {item.valid
                ? item.root_element
                  ? `Root <${item.root_element}>`
                  : "No root element"
                : `${item.error ?? "Error"}${item.line != null ? ` at line ${item.line}, column ${item.column}` : ""}`}
            </p>
            <pre className="max-h-20 overflow-hidden rounded bg-slate-50 px-2 py-1 font-mono text-[11px] whitespace-pre-wrap break-all text-slate-500">
              {item.xml_preview || "(empty)"}
            </pre>
            <p className="text-[11px] text-slate-400">{formatDate(item.created_at)}</p>
          </li>
        ))}
        {data && data.items.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-slate-500">No saved checks yet.</li>
        )}
      </ul>

      <div className="flex items-center justify-between border-t border-slate-200 px-4 py-2 text-sm">
        <button
          type="button"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1 || loading}
          className="rounded-md border border-slate-300 px-3 py-1 hover:bg-slate-100 disabled:opacity-40"
        >
          Previous
        </button>
        <span className="text-xs text-slate-500">
          Page {page} of {totalPages}
        </span>
        <button
          type="button"
          onClick={() => setPage((p) => p + 1)}
          disabled={page >= totalPages || loading}
          className="rounded-md border border-slate-300 px-3 py-1 hover:bg-slate-100 disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}

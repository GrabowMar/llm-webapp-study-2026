import { useCallback, useEffect, useState } from "react";
import type { CheckPage, SavedCheck } from "../api";
import { api } from "../api";

interface Props {
  token: string;
  refreshTick: number;
}

type Filter = "all" | "valid" | "invalid";

const PAGE_SIZE = 10;

export default function HistoryPanel({ token, refreshTick }: Props) {
  const [data, setData] = useState<CheckPage | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api.listValidations(token, {
        valid: filter === "all" ? null : filter === "valid" ? "true" : "false",
        page,
        page_size: PAGE_SIZE,
      });
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to load history");
    }
  }, [token, filter, page]);

  useEffect(() => {
    load();
  }, [load, refreshTick]);

  useEffect(() => {
    if (data && data.items.length === 0 && data.page > 1) setPage((pg) => pg - 1);
  }, [data]);

  async function remove(id: number) {
    setBusyId(id);
    try {
      await api.deleteValidation(id, token);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "delete failed");
    } finally {
      setBusyId(null);
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-800">Saved checks</h2>
        <div className="flex rounded-lg border border-slate-200 p-0.5 text-xs font-medium">
          {(
            [
              ["all", "All"],
              ["valid", "Well-formed"],
              ["invalid", "Invalid"],
            ] as [Filter, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setFilter(key);
                setPage(1);
              }}
              className={`rounded-md px-2.5 py-1 transition ${
                filter === key
                  ? "bg-indigo-600 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {data && (
          <span className="ml-auto text-xs text-slate-500">
            {data.total} saved check{data.total === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {error && (
        <p className="mx-4 mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="divide-y divide-slate-100">
        {data?.items.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-slate-500">
            Nothing saved yet — check some XML and toggle “Save”.
          </p>
        )}
        {data?.items.map((item: SavedCheck) => (
          <article key={item.id} className="flex items-start gap-3 px-4 py-3">
            <span
              className={`mt-0.5 inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${
                item.valid
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-red-100 text-red-800"
              }`}
            >
              {item.valid ? "OK" : "Error"}
            </span>
            <div className="min-w-0 flex-1">
              <code className="block truncate font-mono text-xs text-slate-700">
                {item.xml_preview}
              </code>
              <p className="mt-0.5 text-xs text-slate-500">
                {new Date(item.created_at).toLocaleString()}
                {" · "}
                {item.valid
                  ? `root: ${item.root_element ?? "?"}`
                  : `${item.error ?? "error"} (line ${item.line ?? "?"}, column ${item.column ?? "?"})`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => remove(item.id)}
              disabled={busyId === item.id}
              className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
            >
              Delete
            </button>
          </article>
        ))}
      </div>

      {data && data.total > data.page_size && (
        <div className="flex items-center justify-center gap-3 border-t border-slate-200 px-4 py-3 text-sm">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded-lg border border-slate-300 px-3 py-1 text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-xs text-slate-600">
            page {data.page} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="rounded-lg border border-slate-300 px-3 py-1 text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </section>
  );
}

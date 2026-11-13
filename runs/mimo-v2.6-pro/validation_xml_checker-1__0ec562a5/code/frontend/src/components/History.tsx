import { useCallback, useEffect, useState } from "react";
import { ApiError, deleteCheck, listChecks } from "../api";
import type { SavedCheck, SavedPage, Session } from "../types";

const PAGE_SIZE = 10;

type Filter = "all" | "valid" | "invalid";

export default function History({
  session,
  refreshKey,
  onSessionExpired,
}: {
  session: Session;
  refreshKey: number;
  onSessionExpired: () => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<SavedPage | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setFailure(null);
    try {
      const valid = filter === "all" ? null : filter === "valid";
      setData(await listChecks(session, { valid, page, pageSize: PAGE_SIZE }));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) onSessionExpired();
      else setFailure(err instanceof Error ? err.message : "Could not load saved checks");
    } finally {
      setBusy(false);
    }
  }, [session, filter, page, onSessionExpired]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  async function remove(item: SavedCheck) {
    setFailure(null);
    try {
      await deleteCheck(session, item.id);
      if (data && data.items.length === 1 && page > 1) setPage(page - 1);
      else await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) onSessionExpired();
      else setFailure(err instanceof Error ? err.message : "Could not delete the check");
    }
  }

  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-900">
          Saved checks <span className="font-normal text-slate-500">({total})</span>
        </h2>
        <div className="inline-flex rounded-md border border-slate-300 p-0.5">
          {(["all", "valid", "invalid"] as Filter[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setFilter(value);
                setPage(1);
              }}
              className={`rounded px-3 py-1 text-xs font-medium capitalize ${
                filter === value
                  ? "bg-slate-800 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      {failure && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{failure}</p>
      )}

      {data && data.items.length === 0 && (
        <p className="mt-4 text-sm text-slate-500">No saved checks yet.</p>
      )}

      <ul className="mt-3 divide-y divide-slate-100">
        {data?.items.map((item) => (
          <li key={item.id} className="flex items-start justify-between gap-3 py-3">
            <div className="min-w-0">
              <code className="block truncate font-mono text-xs text-slate-600">
                {item.xml_preview}
              </code>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                {item.valid ? (
                  <>
                    <span className="rounded-full bg-green-100 px-2 py-0.5 font-medium text-green-800">
                      Well-formed
                    </span>
                    <span className="text-slate-600">
                      Root element:{" "}
                      <code className="rounded bg-slate-100 px-1 py-0.5 font-mono">
                        {item.root_element}
                      </code>
                    </span>
                  </>
                ) : (
                  <>
                    <span className="rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-800">
                      Not well-formed
                    </span>
                    <span className="text-red-700">
                      {item.error}
                      {item.line !== null && ` (line ${item.line}, column ${item.column})`}
                    </span>
                  </>
                )}
                <span className="text-slate-400">{new Date(item.created_at).toLocaleString()}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void remove(item)}
              disabled={busy}
              className="shrink-0 rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Delete
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex items-center justify-between text-sm">
        <button
          type="button"
          onClick={() => setPage(page - 1)}
          disabled={busy || page <= 1}
          className="rounded-md border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Previous
        </button>
        <span className="text-slate-600">
          Page {page} of {pages}
        </span>
        <button
          type="button"
          onClick={() => setPage(page + 1)}
          disabled={busy || page >= pages}
          className="rounded-md border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </section>
  );
}

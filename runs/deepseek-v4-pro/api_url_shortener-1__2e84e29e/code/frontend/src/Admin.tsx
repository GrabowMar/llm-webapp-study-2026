import { useCallback, useEffect, useState } from "react";
import type { AuthState, PagedLinks } from "./api";
import { listAdminLinks, toggleLink } from "./api";

interface Props {
  auth: AuthState;
}

const PAGE_SIZE = 10;

function truncate(url: string, max = 60): string {
  return url.length > max ? url.slice(0, max) + "…" : url;
}

export default function Admin({ auth }: Props) {
  const [data, setData] = useState<PagedLinks | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setData(await listAdminLinks(auth, page, PAGE_SIZE));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load links");
    } finally {
      setLoading(false);
    }
  }, [auth, page]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function onToggle(id: number) {
    setError(null);
    try {
      await toggleLink(auth, id);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to toggle");
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">All links</h1>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      {loading && <p className="text-sm text-slate-500">Loading…</p>}
      {!loading && data && data.items.length === 0 && (
        <p className="text-sm text-slate-500">No links yet.</p>
      )}
      {!loading && data && data.items.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Short</th>
                <th className="px-4 py-2">Original</th>
                <th className="px-4 py-2">Owner</th>
                <th className="px-4 py-2 text-right">Clicks</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((link) => (
                <tr key={link.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <a href={link.short_url} className="text-indigo-600 underline">
                      /r/{link.short_code}
                    </a>
                  </td>
                  <td className="px-4 py-2">
                    <a
                      href={link.original_url}
                      title={link.original_url}
                      className="text-slate-600 hover:text-slate-900"
                    >
                      {truncate(link.original_url)}
                    </a>
                  </td>
                  <td className="px-4 py-2 font-medium">{link.owner}</td>
                  <td className="px-4 py-2 text-right">{link.click_count}</td>
                  <td className="px-4 py-2">
                    {link.active ? (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                        Active
                      </span>
                    ) : (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                        Disabled
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => onToggle(link.id)}
                      className="rounded px-2 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"
                    >
                      {link.active ? "Disable" : "Enable"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && (
        <div className="mt-3 flex items-center justify-between text-sm">
          <button
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="rounded border border-slate-300 px-3 py-1 font-medium hover:bg-slate-50 disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-slate-500">
            Page {data.page} of {totalPages} ({data.total} links)
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
            className="rounded border border-slate-300 px-3 py-1 font-medium hover:bg-slate-50 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

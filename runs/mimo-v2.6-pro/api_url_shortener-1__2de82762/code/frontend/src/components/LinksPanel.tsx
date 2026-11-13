import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { shortAddress } from "../api";
import type { PagedLinks } from "../api";
import Pager from "./Pager";

const PAGE_SIZE = 10;

interface LinksPanelProps {
  token: string | null;
  username: string | null;
  version: number;
  onChanged: () => void;
}

export default function LinksPanel({ token, username, version, onChanged }: LinksPanelProps) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PagedLinks | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await api.listLinks(page, PAGE_SIZE);
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }, [page]);

  useEffect(() => {
    void load();
  }, [load, version]);

  const remove = async (id: number) => {
    if (!token) return;
    if (!window.confirm("Delete this link permanently?")) return;
    setDeletingId(id);
    try {
      await api.deleteLink(id, token);
      onChanged();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Recent links</h2>

      {error ? (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-slate-500">
              <th className="px-2 py-2 font-medium">Short address</th>
              <th className="px-2 py-2 font-medium">Original address</th>
              <th className="px-2 py-2 font-medium">Clicks</th>
              <th className="px-2 py-2 font-medium">Date</th>
              <th className="px-2 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data && data.items.length > 0 ? (
              data.items.map((link) => (
                <tr key={link.id} className="border-t border-slate-100">
                  <td className="max-w-[200px] px-2 py-2">
                    <a
                      href={link.short_url}
                      className="block truncate font-medium text-indigo-700 hover:underline"
                      title={shortAddress(link)}
                    >
                      {shortAddress(link)}
                    </a>
                  </td>
                  <td className="max-w-[280px] px-2 py-2">
                    <span
                      className="block truncate text-slate-700"
                      title={link.original_url}
                    >
                      {link.original_url}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-slate-700">{link.click_count}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-slate-500">
                    {new Date(link.created_at).toLocaleString()}
                  </td>
                  <td className="px-2 py-2">
                    {token && username === link.owner ? (
                      <button
                        type="button"
                        onClick={() => remove(link.id)}
                        disabled={deletingId === link.id}
                        className="rounded-lg border border-red-300 bg-white px-3 py-1 text-xs font-medium text-red-700 shadow-sm hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {deletingId === link.id ? "Deleting..." : "Delete"}
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-2 py-8 text-center text-slate-400">
                  {data ? "No links yet." : "Loading..."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {data ? (
        <Pager
          page={data.page}
          pageSize={data.page_size}
          total={data.total}
          onPageChange={setPage}
        />
      ) : null}
    </section>
  );
}

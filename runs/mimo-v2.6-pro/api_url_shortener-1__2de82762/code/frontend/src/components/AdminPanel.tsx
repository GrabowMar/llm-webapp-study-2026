import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { shortAddress } from "../api";
import type { PagedLinks } from "../api";
import Pager from "./Pager";

const PAGE_SIZE = 10;

interface AdminPanelProps {
  token: string;
  version: number;
}

export default function AdminPanel({ token, version }: AdminPanelProps) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PagedLinks | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await api.adminListLinks(page, PAGE_SIZE, token);
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }, [page, token]);

  useEffect(() => {
    void load();
  }, [load, version]);

  const toggle = async (id: number) => {
    setBusyId(id);
    try {
      await api.adminToggleLink(id, token);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50/40 p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Admin &middot; all links</h2>
      <p className="mt-1 text-sm text-slate-500">
        Every link, active or disabled, with its owner. Disable a link to stop it
        from working until you re-enable it.
      </p>

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
              <th className="px-2 py-2 font-medium">Owner</th>
              <th className="px-2 py-2 font-medium">Clicks</th>
              <th className="px-2 py-2 font-medium">Status</th>
              <th className="px-2 py-2 font-medium">Date</th>
              <th className="px-2 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data && data.items.length > 0 ? (
              data.items.map((link) => (
                <tr key={link.id} className="border-t border-slate-100">
                  <td className="max-w-[180px] px-2 py-2">
                    <a
                      href={link.short_url}
                      className="block truncate font-medium text-indigo-700 hover:underline"
                      title={shortAddress(link)}
                    >
                      {shortAddress(link)}
                    </a>
                  </td>
                  <td className="max-w-[240px] px-2 py-2">
                    <span
                      className="block truncate text-slate-700"
                      title={link.original_url}
                    >
                      {link.original_url}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-slate-700">{link.owner}</td>
                  <td className="px-2 py-2 text-slate-700">{link.click_count}</td>
                  <td className="px-2 py-2">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        link.is_active
                          ? "bg-green-100 text-green-800"
                          : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {link.is_active ? "Active" : "Disabled"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-slate-500">
                    {new Date(link.created_at).toLocaleString()}
                  </td>
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      onClick={() => toggle(link.id)}
                      disabled={busyId === link.id}
                      className={`rounded-lg border px-3 py-1 text-xs font-medium shadow-sm disabled:cursor-not-allowed disabled:opacity-50 ${
                        link.is_active
                          ? "border-red-300 bg-white text-red-700 hover:bg-red-50"
                          : "border-green-300 bg-white text-green-700 hover:bg-green-50"
                      }`}
                    >
                      {busyId === link.id
                        ? "Working..."
                        : link.is_active
                          ? "Disable"
                          : "Re-enable"}
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="px-2 py-8 text-center text-slate-400">
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

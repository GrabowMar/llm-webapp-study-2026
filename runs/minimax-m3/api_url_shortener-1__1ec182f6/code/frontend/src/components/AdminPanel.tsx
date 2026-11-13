import { useCallback, useEffect, useState } from "react";
import { absoluteShortUrl, api, errorMessage, formatDate } from "../api";
import type { Link, Page } from "../types";
import CopyButton from "./CopyButton";
import Pager from "./Pager";

const PAGE_SIZE = 10;

type AdminPanelProps = {
  refreshKey: number;
  onChanged: () => void;
};

export default function AdminPanel({ refreshKey, onChanged }: AdminPanelProps) {
  const [data, setData] = useState<Page<Link>>({ items: [], total: 0, page: 1, page_size: PAGE_SIZE });
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async (target: number) => {
    try {
      const result = await api.adminListLinks(target, PAGE_SIZE);
      setData(result);
      setError(null);
    } catch (err) {
      setError(errorMessage(err, "The links could not be loaded."));
    }
  }, []);

  useEffect(() => {
    void load(page);
  }, [load, page, refreshKey]);

  async function handleToggle(link: Link) {
    setBusyId(link.id);
    try {
      await api.toggleLink(link.id);
      await load(page);
      onChanged();
    } catch (err) {
      setError(errorMessage(err, "The link could not be updated."));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="rounded-2xl border border-amber-500/30 bg-slate-900/70 p-6 shadow-lg shadow-slate-950/40">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-white">Admin: all links</h2>
        <p className="text-sm text-slate-400">Active and disabled links, with their owners</p>
      </div>

      {error ? (
        <p className="mt-4 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          {error}
        </p>
      ) : null}

      {data.items.length === 0 ? (
        <p className="mt-6 rounded-lg border border-dashed border-slate-700 px-4 py-8 text-center text-sm text-slate-500">
          There are no links yet.
        </p>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-500">
                <th className="pb-3 pr-4 font-medium">Owner</th>
                <th className="pb-3 pr-4 font-medium">Short address</th>
                <th className="pb-3 pr-4 font-medium">Original address</th>
                <th className="pb-3 pr-4 font-medium">Clicks</th>
                <th className="pb-3 pr-4 font-medium">Status</th>
                <th className="pb-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {data.items.map((link) => {
                const active = link.is_active !== false;
                return (
                  <tr key={link.id} className="align-middle">
                    <td className="py-3 pr-4 font-medium text-slate-200">{link.owner}</td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <a
                          href={absoluteShortUrl(link)}
                          className="font-mono text-indigo-300 underline decoration-indigo-500/40 underline-offset-4 hover:text-white"
                        >
                          {link.short_url}
                        </a>
                        <CopyButton value={absoluteShortUrl(link)} />
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <a
                        href={link.original_url}
                        target="_blank"
                        rel="noreferrer"
                        title={link.original_url}
                        className="block max-w-[260px] truncate text-slate-300 hover:text-white"
                      >
                        {link.original_url}
                      </a>
                    </td>
                    <td className="py-3 pr-4 tabular-nums text-slate-300">{link.click_count}</td>
                    <td className="py-3 pr-4">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-medium ${
                          active
                            ? "bg-emerald-500/15 text-emerald-300"
                            : "bg-slate-700/50 text-slate-300"
                        }`}
                      >
                        {active ? "Active" : "Disabled"}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <button
                        type="button"
                        onClick={() => void handleToggle(link)}
                        disabled={busyId === link.id}
                        className={`rounded-md border px-2.5 py-1 text-xs font-medium transition disabled:opacity-50 ${
                          active
                            ? "border-rose-500/40 text-rose-300 hover:bg-rose-500/10"
                            : "border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10"
                        }`}
                      >
                        {busyId === link.id
                          ? "Working..."
                          : active
                            ? "Disable"
                            : "Re-enable"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-5 border-t border-slate-800 pt-4">
        <Pager
          page={data.page || page}
          pageSize={PAGE_SIZE}
          total={data.total}
          onChange={(next) => setPage(next)}
        />
      </div>
    </section>
  );
}

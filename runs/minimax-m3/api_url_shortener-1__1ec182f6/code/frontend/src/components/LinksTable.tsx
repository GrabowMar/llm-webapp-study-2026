import { useCallback, useEffect, useState } from "react";
import { absoluteShortUrl, api, errorMessage, formatDate, isOwnedBy } from "../api";
import type { Link, Page, User } from "../types";
import CopyButton from "./CopyButton";
import Pager from "./Pager";

const PAGE_SIZE = 10;

type LinksTableProps = {
  user: User;
  refreshKey: number;
};

export default function LinksTable({ user, refreshKey }: LinksTableProps) {
  const [data, setData] = useState<Page<Link>>({ items: [], total: 0, page: 1, page_size: PAGE_SIZE });
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async (target: number) => {
    try {
      const result = await api.listLinks(target, PAGE_SIZE);
      setData(result);
      setError(null);
    } catch (err) {
      setError(errorMessage(err, "The links could not be loaded."));
    }
  }, []);

  useEffect(() => {
    void load(page);
  }, [load, page, refreshKey]);

  async function handleDelete(link: Link) {
    const confirmed = window.confirm(
      `Delete ${absoluteShortUrl(link)}?\n\nThis permanently removes the link and stops redirecting.`,
    );
    if (!confirmed) {
      return;
    }
    setBusyId(link.id);
    try {
      await api.deleteLink(link.id);
      await load(page);
    } catch (err) {
      setError(errorMessage(err, "The link could not be deleted."));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-lg shadow-slate-950/40">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-white">Recent links</h2>
        <p className="text-sm text-slate-400">Newest first</p>
      </div>

      {error ? (
        <p className="mt-4 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          {error}
        </p>
      ) : null}

      {data.items.length === 0 ? (
        <p className="mt-6 rounded-lg border border-dashed border-slate-700 px-4 py-8 text-center text-sm text-slate-500">
          No links yet. Shorten your first address above.
        </p>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-500">
                <th className="pb-3 pr-4 font-medium">Short address</th>
                <th className="pb-3 pr-4 font-medium">Original address</th>
                <th className="pb-3 pr-4 font-medium">Clicks</th>
                <th className="pb-3 pr-4 font-medium">Created</th>
                <th className="pb-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {data.items.map((link) => {
                const owned = isOwnedBy(link, user);
                return (
                  <tr key={link.id} className="align-middle">
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
                        className="block max-w-[280px] truncate text-slate-300 hover:text-white"
                      >
                        {link.original_url}
                      </a>
                    </td>
                    <td className="py-3 pr-4 tabular-nums text-slate-300">{link.click_count}</td>
                    <td className="py-3 pr-4 whitespace-nowrap text-slate-400">
                      {formatDate(link.created_at)}
                    </td>
                    <td className="py-3 text-right">
                      {owned ? (
                        <button
                          type="button"
                          onClick={() => void handleDelete(link)}
                          disabled={busyId === link.id}
                          className="rounded-md border border-rose-500/40 px-2.5 py-1 text-xs font-medium text-rose-300 transition hover:bg-rose-500/10 disabled:opacity-50"
                        >
                          {busyId === link.id ? "Deleting..." : "Delete"}
                        </button>
                      ) : (
                        <span className="text-xs text-slate-600">by {link.owner}</span>
                      )}
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

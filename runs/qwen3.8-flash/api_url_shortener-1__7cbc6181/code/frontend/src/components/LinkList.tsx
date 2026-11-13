import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import type { Link, Page } from "../types";
import LinkRow from "./LinkRow";
import Pager from "./Pager";

const PAGE_SIZE = 10;

function absolute(link: Link): string {
  return new URL(link.short_url, window.location.origin).href;
}

interface LinkListProps {
  username: string;
  isAdmin: boolean;
  refreshKey: number;
  onChanged: () => void;
}

export default function LinkList({ username, isAdmin, refreshKey, onChanged }: LinkListProps) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<Link> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = isAdmin
        ? await api.adminListLinks(page, PAGE_SIZE)
        : await api.listLinks(page, PAGE_SIZE);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load links.");
    }
  }, [isAdmin, page]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  async function remove(link: Link) {
    setBusyId(link.id);
    try {
      await api.deleteLink(link.id);
      setConfirmId(null);
      onChanged();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function toggle(link: Link) {
    setBusyId(link.id);
    try {
      await api.adminToggleLink(link.id);
      onChanged();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <h2 className="border-b border-slate-200 px-4 py-3 text-base font-semibold text-slate-800">
        {isAdmin ? "All links (admin)" : "Recent links"}
      </h2>
      {error && (
        <p className="mx-4 mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      {data && data.items.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-slate-500">No links yet.</p>
      ) : (
        data && (
          <ul className="divide-y divide-slate-100">
            {data.items.map((link) => (
              <li key={link.id}>
                <LinkRow
                  link={link}
                  absolute={absolute(link)}
                  showOwner={isAdmin}
                  canDelete={link.owner === username}
                  canToggle={isAdmin}
                  busy={busyId === link.id}
                  confirming={confirmId === link.id}
                  onConfirm={() => remove(link)}
                  onCancelConfirm={() => setConfirmId(null)}
                  onDelete={() => setConfirmId(link.id)}
                  onToggle={() => toggle(link)}
                />
              </li>
            ))}
          </ul>
        )
      )}
      <div className="px-4 pb-3">
        {data && (
          <Pager
            page={data.page}
            pageSize={data.page_size}
            total={data.total}
            onPage={(p) => setPage(Math.max(1, p))}
          />
        )}
      </div>
    </div>
  );
}

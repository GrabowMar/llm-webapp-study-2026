import { useCallback, useEffect, useState } from "react";
import type { AuthState, Link, PagedLinks } from "./api";
import {
  createLink,
  deleteLink,
  listLinks,
} from "./api";

interface Props {
  auth: AuthState;
}

const PAGE_SIZE = 10;

function truncate(url: string, max = 60): string {
  return url.length > max ? url.slice(0, max) + "…" : url;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export default function Dashboard({ auth }: Props) {
  const [url, setUrl] = useState("");
  const [created, setCreated] = useState<Link | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const [data, setData] = useState<PagedLinks | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setData(await listLinks(auth, page, PAGE_SIZE));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load links");
    } finally {
      setLoading(false);
    }
  }, [auth, page]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function onShorten(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const link = await createLink(auth, url);
      setCreated(link);
      setUrl("");
      setPage(1);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to shorten");
    } finally {
      setBusy(false);
    }
  }

  async function onCopy() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.short_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  async function onDelete(link: Link) {
    if (!window.confirm(`Delete this link? ${link.short_url}`)) return;
    try {
      await deleteLink(auth, link.id);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-8">
      <section>
        <h1 className="mb-4 text-2xl font-bold">Shorten a link</h1>
        <form onSubmit={onShorten} className="flex flex-col gap-3 sm:flex-row">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/very/long/path"
            className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            Shorten
          </button>
        </form>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        {created && (
          <div className="mt-4 flex items-center gap-2 rounded border border-green-200 bg-green-50 p-3">
            <a
              href={created.short_url}
              className="text-sm font-medium text-green-800 underline"
            >
              {created.short_url}
            </a>
            <button
              onClick={onCopy}
              className="rounded bg-white px-3 py-1 text-sm font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-xl font-bold">Recent links</h2>
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
                  <th className="px-4 py-2 text-right">Clicks</th>
                  <th className="px-4 py-2">Created</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((link) => (
                  <tr key={link.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2">
                      <a
                        href={link.short_url}
                        className="text-indigo-600 underline"
                      >
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
                    <td className="px-4 py-2 text-right">
                      {link.click_count}
                    </td>
                    <td className="px-4 py-2 text-slate-500">
                      {formatDate(link.created_at)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={() => onDelete(link)}
                        className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                      >
                        Delete
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
      </section>
    </div>
  );
}

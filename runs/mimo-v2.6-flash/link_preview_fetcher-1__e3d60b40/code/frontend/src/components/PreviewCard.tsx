import { useState } from "react";
import { messageOf, type Preview } from "../api";

interface Props {
  preview: Preview;
  onRefresh: (id: number) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export default function PreviewCard({ preview, onRefresh, onDelete }: Props) {
  const [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const target = preview.final_url || preview.url;
  const host = hostOf(target);
  const title = preview.title || host;
  const canRefresh = !refreshing && !deleting;
  const canDelete = !refreshing && !deleting;

  async function handleRefresh() {
    if (!canRefresh) return;
    setRefreshing(true);
    setError(null);
    try {
      await onRefresh(preview.id);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setRefreshing(false);
    }
  }

  async function handleDelete() {
    if (!canDelete) return;
    setDeleting(true);
    setError(null);
    try {
      await onDelete(preview.id);
    } catch (err) {
      setError(messageOf(err));
      setDeleting(false);
    }
  }

  return (
    <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <a
        href={target}
        target="_blank"
        rel="noopener noreferrer"
        className="block border-b border-slate-100"
      >
        {preview.image_url ? (
          <img
            src={preview.image_url}
            alt=""
            className="h-44 w-full bg-slate-100 object-cover"
          />
        ) : (
          <div className="flex h-44 w-full items-center justify-center bg-slate-100 text-sm text-slate-400">
            No image
          </div>
        )}
      </a>

      <div className="space-y-2 p-4">
        <h2 className="text-base font-semibold leading-snug text-slate-900">
          <a
            href={target}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-sky-700 hover:underline"
          >
            {title}
          </a>
        </h2>

        {preview.description && (
          <p className="line-clamp-3 text-sm text-slate-600">{preview.description}</p>
        )}

        <div className="flex items-center justify-between gap-3">
          <a
            href={target}
            target="_blank"
            rel="noopener noreferrer"
            className="min-w-0 truncate text-sm text-sky-600 hover:underline"
            title={target}
          >
            {host}
          </a>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={!canRefresh}
              className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={!canDelete}
              className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>

        <p className="text-xs text-slate-400">
          HTTP {preview.status_code} · fetched {preview.fetched_at}
        </p>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </article>
  );
}

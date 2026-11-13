import { useState } from "react";
import { api } from "../api";
import type { Preview } from "../types";
import { formatTimestamp, hostOf } from "../utils";

type PreviewCardProps = {
  preview: Preview;
  onUpdated: (preview: Preview) => void;
  onDeleted: (id: number) => void;
};

export default function PreviewCard({ preview, onUpdated, onDeleted }: PreviewCardProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const link = preview.final_url || preview.url;
  const title = preview.title || link;
  const host = hostOf(link);

  async function handleRefresh() {
    setError(null);
    setRefreshing(true);
    try {
      const updated = await api.refreshPreview(preview.id);
      setImageFailed(false);
      onUpdated(updated);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not refresh this preview.");
    } finally {
      setRefreshing(false);
    }
  }

  async function handleDelete() {
    setError(null);
    setDeleting(true);
    try {
      await api.deletePreview(preview.id);
      onDeleted(preview.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete this preview.");
      setDeleting(false);
    }
  }

  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row">
      <a
        href={link}
        target="_blank"
        rel="noreferrer noopener"
        className="group flex min-w-0 flex-1 gap-4"
      >
        <div className="h-24 w-32 shrink-0 overflow-hidden rounded-xl bg-slate-100 sm:h-28 sm:w-44">
          {preview.image_url && !imageFailed ? (
            <img
              src={preview.image_url}
              alt=""
              loading="lazy"
              onError={() => setImageFailed(true)}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center px-2 text-center text-xs font-medium uppercase tracking-wide text-slate-400">
              No image
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-slate-900 group-hover:text-indigo-600">
            {title}
          </h3>
          <p className="mt-1 line-clamp-2 text-sm text-slate-600">
            {preview.description || "No description available."}
          </p>
          <p className="mt-2 truncate text-xs font-semibold uppercase tracking-wide text-indigo-600">
            {host}
          </p>
          <p className="mt-1 truncate text-xs text-slate-400">{link}</p>
        </div>
      </a>

      <div className="flex shrink-0 items-start gap-2 sm:flex-col">
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing || deleting}
          aria-busy={refreshing}
          title="Refresh this preview"
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-indigo-400 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {refreshing ? (
            <span
              aria-hidden="true"
              className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600"
            />
          ) : null}
          Refresh
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting || refreshing}
          aria-busy={deleting}
          title="Delete this preview"
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-rose-300 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {deleting ? (
            <span
              aria-hidden="true"
              className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-rose-600"
            />
          ) : null}
          Delete
        </button>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-rose-600">
          {error}
        </p>
      ) : null}

      <p className="sr-only">Fetched {formatTimestamp(preview.fetched_at)}</p>
    </article>
  );
}

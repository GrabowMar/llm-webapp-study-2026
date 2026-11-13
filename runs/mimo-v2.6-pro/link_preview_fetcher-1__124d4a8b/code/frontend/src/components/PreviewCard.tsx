import { useState } from "react";
import type { Preview } from "../types";

type Props = {
  preview: Preview;
  onRefresh: (id: number) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
};

export default function PreviewCard({ preview, onRefresh, onDelete }: Props) {
  const [busy, setBusy] = useState<"refresh" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const link = preview.final_url || preview.url;
  let host = link;
  try {
    host = new URL(link).host;
  } catch {
    // keep the raw value as a fallback label
  }

  async function refresh() {
    setBusy("refresh");
    setError(null);
    try {
      await onRefresh(preview.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not refresh the preview.");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("delete");
    setError(null);
    try {
      await onDelete(preview.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the preview.");
      setBusy(null);
    }
  }

  return (
    <article className="flex gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <a
        href={link}
        target="_blank"
        rel="noreferrer"
        className="block h-28 w-40 shrink-0 overflow-hidden rounded-lg bg-slate-100"
        aria-label={preview.title || link}
      >
        {preview.image_url ? (
          <img
            src={preview.image_url}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">
            No image
          </div>
        )}
      </a>

      <div className="flex min-w-0 flex-1 flex-col">
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          className="line-clamp-2 font-semibold hover:underline"
        >
          {preview.title || link}
        </a>
        {preview.description && (
          <p className="mt-1 line-clamp-2 text-sm text-slate-600">
            {preview.description}
          </p>
        )}
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-3">
          <span className="truncate text-xs text-slate-400">{host}</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={refresh}
              disabled={busy !== null}
              className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy === "refresh" ? "Refreshing…" : "Refresh"}
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={busy !== null}
              className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy === "delete" ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </div>
    </article>
  );
}

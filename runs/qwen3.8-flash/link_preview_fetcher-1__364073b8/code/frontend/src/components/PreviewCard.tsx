import { useState } from "react";
import type { Preview } from "../types";

interface Props {
  preview: Preview;
  busy: boolean;
  onRefresh: (id: number) => void;
  onDelete: (id: number) => void;
}

function hostOf(preview: Preview): string {
  try {
    return new URL(preview.final_url || preview.url).host;
  } catch {
    return "";
  }
}

export default function PreviewCard({ preview, busy, onRefresh, onDelete }: Props) {
  const [imageFailed, setImageFailed] = useState(false);
  const host = hostOf(preview);
  const title = preview.title || host || preview.url;

  return (
    <article className="flex overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex min-w-0 flex-1 flex-col gap-1 p-4">
        <a
          href={preview.final_url || preview.url}
          target="_blank"
          rel="noreferrer"
          className="truncate text-base font-semibold text-blue-700 hover:underline"
        >
          {title}
        </a>
        {host && (
          <p className="flex items-center gap-1 text-xs text-slate-500">
            {preview.status_code != null && preview.status_code >= 400 && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-700">
                HTTP {preview.status_code}
              </span>
            )}
            {host}
          </p>
        )}
        {preview.description && (
          <p className="line-clamp-3 text-sm text-slate-600">{preview.description}</p>
        )}
        <div className="mt-auto flex items-center justify-between pt-3">
          <span className="text-xs text-slate-400">
            {new Date(preview.fetched_at).toLocaleString()}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => onRefresh(preview.id)}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              {busy && (
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-400 border-t-slate-700" />
              )}
              Refresh
            </button>
            <button
              onClick={() => onDelete(preview.id)}
              disabled={busy}
              className="rounded-md border border-red-200 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
      {preview.image_url && !imageFailed && (
        <a
          href={preview.final_url || preview.url}
          target="_blank"
          rel="noreferrer"
          className="hidden w-40 shrink-0 sm:block"
        >
          <img
            src={preview.image_url}
            alt=""
            onError={() => setImageFailed(true)}
            className="h-full w-full object-cover"
          />
        </a>
      )}
    </article>
  );
}

import { useState } from "react";
import type { Preview } from "./api";

interface Props {
  preview: Preview;
  onRefresh: (id: number) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}

function hostOf(preview: Preview): string {
  const source = preview.final_url || preview.url;
  try {
    return new URL(source).host;
  } catch {
    return source;
  }
}

function hostnameOf(preview: Preview): string {
  const source = preview.final_url || preview.url;
  try {
    return new URL(source).hostname;
  } catch {
    return "";
  }
}

export default function PreviewCard({ preview, onRefresh, onDelete }: Props) {
  const [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const title = preview.title || preview.url;
  const description = preview.description;
  const image = preview.image_url;
  const initial = hostnameOf(preview).replace(/^www\./, "").charAt(0) || "?";

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await onRefresh(preview.id);
    } finally {
      setRefreshing(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await onDelete(preview.id);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <article className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
      <a
        href={preview.final_url || preview.url}
        target="_blank"
        rel="noreferrer"
        className="block aspect-video w-full overflow-hidden bg-slate-100"
      >
        {image ? (
          <img
            src={image}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-100 to-slate-200 text-4xl font-bold text-indigo-400">
            {initial.toUpperCase()}
          </div>
        )}
      </a>

      <div className="flex flex-1 flex-col p-4">
        <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-indigo-600">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-indigo-500" />
          <span className="truncate">{hostOf(preview)}</span>
        </div>
        <a
          href={preview.final_url || preview.url}
          target="_blank"
          rel="noreferrer"
          className="line-clamp-2 font-semibold text-slate-900 hover:text-indigo-700"
        >
          {title}
        </a>
        {description && (
          <p className="mt-1 line-clamp-3 text-sm text-slate-500">
            {description}
          </p>
        )}

        <div className="mt-auto flex items-center justify-between pt-4">
          <span className="text-xs text-slate-400">
            {new Date(preview.fetched_at).toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing || deleting}
              className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={refreshing || deleting}
              className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

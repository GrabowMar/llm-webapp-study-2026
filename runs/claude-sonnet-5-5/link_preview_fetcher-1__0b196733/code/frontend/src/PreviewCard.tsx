import { useState } from "react";
import type { Preview } from "./api";

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function safeHref(url: string): string | undefined {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : undefined;
  } catch {
    return undefined;
  }
}

export default function PreviewCard({
  preview,
  onRefresh,
  onDelete,
}: {
  preview: Preview;
  onRefresh: (id: number) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}) {
  const [busy, setBusy] = useState<"refresh" | "delete" | null>(null);
  const [imgFailed, setImgFailed] = useState(false);
  const target = preview.final_url ?? preview.url;
  const href = safeHref(target);
  const image = preview.image_url ? safeHref(preview.image_url) : undefined;

  async function run(kind: "refresh" | "delete") {
    setBusy(kind);
    try {
      await (kind === "refresh" ? onRefresh(preview.id) : onDelete(preview.id));
    } finally {
      setBusy(null);
    }
  }

  const btn =
    "rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60";

  return (
    <article className="flex flex-col overflow-hidden rounded-xl bg-white shadow" data-testid="preview-card">
      <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="block">
        {image && !imgFailed ? (
          <img
            src={image}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
            className="h-40 w-full object-cover"
          />
        ) : (
          <div className="flex h-40 w-full items-center justify-center bg-slate-100 text-sm text-slate-400">
            No image
          </div>
        )}
        <div className="space-y-1 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">{hostOf(target)}</p>
          <h3 className="line-clamp-2 font-semibold text-slate-900">{preview.title ?? target}</h3>
          {preview.description && (
            <p className="line-clamp-3 text-sm text-slate-600">{preview.description}</p>
          )}
        </div>
      </a>
      <div className="mt-auto flex gap-2 px-4 pb-4">
        <button className={btn} disabled={busy !== null} onClick={() => run("refresh")}>
          {busy === "refresh" ? "Refreshing…" : "Refresh"}
        </button>
        <button
          className={`${btn} text-red-600`}
          disabled={busy !== null}
          onClick={() => run("delete")}
        >
          {busy === "delete" ? "Deleting…" : "Delete"}
        </button>
      </div>
    </article>
  );
}

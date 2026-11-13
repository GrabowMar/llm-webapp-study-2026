import { useState } from "react";
import { ArrowUpRight, Globe2, LoaderCircle, RefreshCw, Trash2 } from "lucide-react";
import { hostOf, safeWebUrl, type Preview } from "../api";

export default function PreviewCard({ preview, list = false, refreshing, deleting, onRefresh, onDelete }: {
  preview: Preview;
  list?: boolean;
  refreshing?: boolean;
  deleting?: boolean;
  onRefresh: () => void;
  onDelete: () => void;
}) {
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const image = safeWebUrl(preview.image_url);
  const host = hostOf(preview.final_url || preview.url);
  const href = safeWebUrl(preview.final_url) ?? safeWebUrl(preview.url);
  const title = preview.title || host;
  const date = new Date(preview.fetched_at);
  const dateText = Number.isNaN(date.getTime()) ? "Saved link" : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return (
    <article className={`group overflow-hidden rounded-xl border border-line bg-white transition duration-200 hover:-translate-y-0.5 hover:border-olive/30 hover:shadow-lg hover:shadow-ink/5 ${list ? "flex" : "flex flex-col"}`}>
      <a href={href} target="_blank" rel="noopener noreferrer" aria-label={`Open ${title}`} className={`relative block shrink-0 overflow-hidden bg-sidebar ${list ? "hidden w-44 sm:block" : "aspect-[1.85/1]"}`}>
        {image && failedImage !== image ? (
          <img src={image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailedImage(image)} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.035]" />
        ) : (
          <div className="flex h-full min-h-36 flex-col items-center justify-center gap-3 bg-gradient-to-br from-sidebar to-[#e6eadb] text-olive/70">
            <Globe2 size={40} strokeWidth={1} />
            <span className="max-w-[85%] truncate text-xs tracking-wide">{host}</span>
          </div>
        )}
        <span className="absolute right-3 top-3 rounded-full bg-white/90 p-1.5 text-ink opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100"><ArrowUpRight size={15} /></span>
      </a>
      <div className="flex min-w-0 flex-1 flex-col p-5">
        <div className="mb-3 flex items-center gap-2 text-[11px] text-muted"><Globe2 size={12} /><span className="truncate">{host}</span>{preview.status_code >= 400 && <span className="ml-auto rounded bg-amber-50 px-1.5 text-amber-700">HTTP {preview.status_code}</span>}</div>
        <a href={href} target="_blank" rel="noopener noreferrer" className="rounded-sm font-serif text-[21px] font-medium leading-snug tracking-[-0.3px] hover:text-olive"><h3 className="line-clamp-2">{title}</h3></a>
        <p className={`mt-2 text-[12px] leading-[1.8] text-muted ${list ? "line-clamp-2" : "line-clamp-3"}`}>{preview.description || "A good find, saved for later. Open this link to explore the page."}</p>
        <div className="mt-auto flex items-center justify-between gap-2 pt-5">
          <time dateTime={preview.fetched_at} title={`Last fetched: ${Number.isNaN(date.getTime()) ? preview.fetched_at : date.toLocaleString()}`} className="text-[10px] text-muted/80">{dateText}</time>
          <div className="flex gap-1">
            <button title="Refresh preview" aria-label={`Refresh ${title}`} disabled={refreshing || deleting} onClick={onRefresh} className="rounded-md p-1.5 text-muted/70 transition hover:bg-sidebar hover:text-olive disabled:opacity-40">{refreshing ? <LoaderCircle size={14} className="animate-spin motion-reduce:animate-none" /> : <RefreshCw size={14} />}</button>
            <button title="Delete link" aria-label={`Delete ${title}`} disabled={refreshing || deleting} onClick={onDelete} className="rounded-md p-1.5 text-muted/70 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40">{deleting ? <LoaderCircle size={14} className="animate-spin motion-reduce:animate-none" /> : <Trash2 size={14} />}</button>
          </div>
        </div>
      </div>
    </article>
  );
}

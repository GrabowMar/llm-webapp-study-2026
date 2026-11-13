import { useState } from "react";
import { ArrowUpRight, CalendarDays, Image, LoaderCircle, Trash2, UserRound } from "lucide-react";
import { api, formatDate, formatSize, type GalleryImage, type Session } from "../api";

interface ImageViewerProps {
  image: GalleryImage;
  session: Session | null;
  onDeleted: () => void;
}

export default function ImageViewer({ image, session, onDeleted }: ImageViewerProps) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [broken, setBroken] = useState(false);
  const ownImage = session?.username === image.uploader;

  async function remove() {
    if (!session) return;
    setBusy(true);
    setError("");
    try {
      await api(`/images/${image.id}`, { method: "DELETE" }, session.token);
      onDeleted();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to delete this image.");
    } finally { setBusy(false); }
  }

  return (
    <div>
      <div className="flex min-h-48 items-center justify-center rounded-t-2xl bg-[#e9e9e2] p-3 sm:p-5">
        {broken ? <p className="py-20 text-sm text-muted">This image is no longer available.</p> : <img src={image.url} alt={image.title || image.filename} onError={() => setBroken(true)} className="max-h-[64dvh] max-w-full rounded object-contain" />}
      </div>
      <div className="p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><p className="mb-2 text-[10px] font-semibold uppercase tracking-[.16em] text-accent">A shared perspective</p><h2 className="break-words font-serif text-3xl">{image.title || image.filename}</h2>{image.title && <p className="mt-2 break-all text-sm text-muted">{image.filename}</p>}</div><a href={image.url} target="_blank" rel="noreferrer" className="button-secondary text-xs">View original <ArrowUpRight size={15} /></a></div>
        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-line pt-5 text-xs text-muted"><span className="flex items-center gap-2"><UserRound size={14} /><span className="font-medium text-ink">{image.uploader}</span></span><span className="flex items-center gap-2"><CalendarDays size={14} />{formatDate(image.uploaded_at)}</span><span className="flex items-center gap-2"><Image size={14} />{formatSize(image.size_bytes)} · {image.content_type === "image/png" ? "PNG" : "JPEG"}</span></div>
        {ownImage && <div className="mt-6 border-t border-line pt-5">{confirming ? <div className="rounded-xl border border-red-100 bg-red-50 p-4"><p className="text-sm font-semibold">Delete this image?</p><p className="mt-1 text-xs leading-relaxed text-muted">It will be removed from the gallery permanently. This can’t be undone.</p><div className="mt-4 flex gap-3"><button disabled={busy} onClick={remove} className="inline-flex items-center gap-2 rounded-lg bg-red-700 px-4 py-2 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-50">{busy ? <LoaderCircle size={14} className="animate-spin" /> : <Trash2 size={14} />}Delete image</button><button disabled={busy} onClick={() => setConfirming(false)} className="button-secondary py-2 text-xs">Keep image</button></div></div> : <button onClick={() => setConfirming(true)} className="flex items-center gap-2 text-xs font-medium text-red-700 hover:underline"><Trash2 size={14} />Delete your image</button>}</div>}
        {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      </div>
    </div>
  );
}

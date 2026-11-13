import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUpRight, Check, ImagePlus, LoaderCircle, Upload, X } from "lucide-react";
import { api, formatSize, type GalleryImage } from "../api";

interface UploadFormProps {
  token: string;
  onSuccess: (image: GalleryImage) => void;
}

export default function UploadForm({ token, onSuccess }: UploadFormProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!file) { setPreview(""); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function chooseFile(chosen: File | undefined) {
    if (!chosen) return;
    setError("");
    if (!["image/png", "image/jpeg"].includes(chosen.type) && !/\.(png|jpe?g)$/i.test(chosen.name)) {
      setError("Choose a PNG or JPEG image.");
      return;
    }
    if (chosen.size > 15 * 1024 * 1024) { setError("This image is too large. The maximum file size is 15 MB."); return; }
    setFile(chosen);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file) { setError("Choose an image to share first."); return; }
    setBusy(true);
    setError("");
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = () => reject(new Error("We couldn’t read this file. Try selecting it again."));
        reader.readAsDataURL(file);
      });
      const image = await api<GalleryImage>("/images", { method: "POST", body: JSON.stringify({ filename: file.name, data, title: title.trim() || null }) }, token);
      onSuccess(image);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to upload. Please try again.");
    } finally { setBusy(false); }
  }

  return (
    <div className="p-7 sm:p-9">
      <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent"><ImagePlus size={24} strokeWidth={1.6} /></div>
      <h2 className="font-serif text-3xl tracking-tight">Share your perspective.</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">A place, a feeling, a little moment worth keeping.</p>
      <form onSubmit={submit} className="mt-6 space-y-5">
        <input ref={input} type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" onChange={(event) => { chooseFile(event.target.files?.[0]); event.target.value = ""; }} className="hidden" aria-label="Choose an image" />
        {preview && file ? (
          <div className="overflow-hidden rounded-xl border border-line bg-white">
            <div className="relative flex h-48 items-center justify-center bg-line/40"><img src={preview} alt="Preview of your selected image" className="h-full w-full object-contain" /><button type="button" disabled={busy} onClick={() => setFile(null)} aria-label="Remove selected image" className="absolute right-2 top-2 rounded-full bg-white/90 p-1.5"><X size={16} /></button></div>
            <div className="flex items-center justify-between gap-3 p-3"><div className="min-w-0"><p className="truncate text-xs font-medium">{file.name}</p><p className="mt-1 text-xs text-muted">{formatSize(file.size)}</p></div><Check size={17} className="shrink-0 text-green-700" /></div>
          </div>
        ) : (
          <button type="button" disabled={busy} onClick={() => input.current?.click()} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); chooseFile(event.dataTransfer.files[0]); }} className={`flex w-full flex-col items-center rounded-xl border-2 border-dashed px-5 py-9 transition ${dragging ? "border-accent bg-accent/10" : "border-line bg-white hover:border-accent/50 hover:bg-accent/5"}`}><Upload size={25} strokeWidth={1.4} className="mb-3 text-accent" /><span className="text-sm font-medium">Drop your image here</span><span className="mt-1 text-xs text-muted">or <span className="text-accent">browse files</span></span><span className="mt-4 text-[11px] text-muted">PNG or JPEG · Up to 15 MB</span></button>
        )}
        <label className="block text-sm font-medium">Give it a title <span className="font-normal text-muted">(optional)</span><input className="form-input mt-2" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} placeholder="What’s the story?" disabled={busy} /></label>
        <p className="flex items-start gap-2 text-xs leading-relaxed text-muted"><span className="mt-0.5 shrink-0"><ImagePlus size={14} /></span>Your image will be visible to everyone. You can delete it at any time.</p>
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <button className="button-primary w-full" disabled={busy || !file}>{busy ? <LoaderCircle size={17} className="animate-spin" /> : <ArrowUpRight size={17} />}{busy ? "Sharing your image…" : "Share image"}</button>
      </form>
    </div>
  );
}

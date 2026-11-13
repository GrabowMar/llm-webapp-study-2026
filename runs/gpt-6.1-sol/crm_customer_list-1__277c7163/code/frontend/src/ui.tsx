import { useEffect, useRef, type ReactNode } from "react";
import { AlertCircle, Check, Leaf, LoaderCircle, X } from "lucide-react";

export const inputClass = "w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-3 focus:ring-brand-50 disabled:bg-slate-50";
export const primaryButton = "inline-flex items-center justify-center gap-2 rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-50";
export const secondaryButton = "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-40";

export function Logo({ light = false }: { light?: boolean }) {
  return <span className={`inline-flex items-center gap-2.5 ${light ? "text-white" : "text-brand-900"}`}>
    <span className={`flex size-9 items-center justify-center rounded-xl ${light ? "bg-white/10" : "bg-brand-700"}`}><Leaf size={20} className="text-white" strokeWidth={1.7} /></span>
    <span className="text-[21px] font-semibold tracking-[-0.8px]">commonplace<span className="text-brand-500">.</span></span>
  </span>;
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return <div role="status" className="flex items-center justify-center gap-2.5 py-14 text-sm text-slate-500"><LoaderCircle size={18} className="animate-spin" />{label}</div>;
}

export function Alert({ children, success = false }: { children: ReactNode; success?: boolean }) {
  return <div role={success ? "status" : "alert"} className={`flex items-start gap-2.5 rounded-lg border p-3 text-sm ${success ? "border-brand-100 bg-brand-50 text-brand-700" : "border-red-100 bg-red-50 text-red-700"}`}>
    {success ? <Check size={17} className="mt-0.5 shrink-0" /> : <AlertCircle size={17} className="mt-0.5 shrink-0" />}<div>{children}</div>
  </div>;
}

export function Field({ label, id, error, hint, required, children }: { label: string; id: string; error?: string; hint?: string; required?: boolean; children: ReactNode }) {
  return <div className="space-y-1.5">
    <label htmlFor={id} className="block text-sm font-medium text-slate-700">{label}{required && <span className="ml-1 text-brand-600">*</span>}</label>
    {children}
    {error ? <p id={`${id}-error`} role="alert" className="text-xs text-red-600">{error}</p> : hint ? <p className="text-xs text-slate-400">{hint}</p> : null}
  </div>;
}

export function Modal({ title, description, children, onClose }: { title: string; description?: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = old; };
  }, []);
  return <dialog ref={ref} aria-labelledby="modal-title" onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-2xl bg-white p-0 text-slate-800 shadow-2xl backdrop:bg-slate-950/35 backdrop:backdrop-blur-[3px]">
    <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
      <div><h2 id="modal-title" className="text-lg font-semibold tracking-tight">{title}</h2>{description && <p className="mt-1 text-sm text-slate-500">{description}</p>}</div>
      <button type="button" onClick={onClose} aria-label="Close dialog" className="-mr-1 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={18} /></button>
    </div>
    {children}
  </dialog>;
}

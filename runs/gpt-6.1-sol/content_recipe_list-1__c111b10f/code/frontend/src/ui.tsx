import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export const primaryButton = "inline-flex items-center justify-center gap-2 rounded-lg bg-ink px-5 py-3 text-sm font-medium text-white transition hover:bg-olive disabled:opacity-50";
export const secondaryButton = "inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-white px-4 py-2.5 text-sm font-medium transition hover:border-olive hover:bg-sage disabled:opacity-40";
export const inputClass = "w-full rounded-lg border border-line bg-white px-3.5 py-3 text-sm text-ink placeholder:text-muted/70 focus:border-olive focus:outline-2 focus:outline-offset-0 focus:outline-olive/20";

export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      element?.close();
      document.body.style.overflow = overflow;
    };
  }, []);
  return <dialog ref={dialog} onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }} aria-labelledby="modal-title" className={`fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] ${wide ? "max-w-xl" : "max-w-md"} overflow-y-auto rounded-2xl border-0 bg-cream p-7 text-ink shadow-2xl backdrop:bg-ink/45 backdrop:backdrop-blur-sm sm:p-9`}>
    <div className="mb-6 flex items-start justify-between gap-4">
      <h2 id="modal-title" className="font-serif text-3xl tracking-tight">{title}</h2>
      <button type="button" onClick={onClose} aria-label="Close dialog" className="-mr-2 -mt-1 rounded-full p-2 text-muted transition hover:bg-sage hover:text-ink"><X size={20} /></button>
    </div>
    {children}
  </dialog>;
}

export function Field({ label, name, error, children, hint }: { label: string; name: string; error?: string; children: ReactNode; hint?: string }) {
  return <div>
    <label htmlFor={name} className="mb-2 block text-sm font-medium">{label}</label>
    {children}
    {error ? <p id={`${name}-error`} role="alert" className="mt-1.5 text-xs text-red-700">{error}</p> : hint ? <p className="mt-1.5 text-xs text-muted">{hint}</p> : null}
  </div>;
}

export function ErrorBox({ message }: { message: string }) {
  return <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{message}</div>;
}

export function Loading({ text = "Gathering something delicious…" }: { text?: string }) {
  return <div role="status" className="flex min-h-48 flex-col items-center justify-center gap-4 text-sm text-muted"><span className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-olive" />{text}</div>;
}

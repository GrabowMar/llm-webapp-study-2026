import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { Icon } from "./Icons";

export const primaryButton = "inline-flex items-center justify-center gap-3 rounded-xl bg-ink px-6 py-3.5 text-sm font-medium text-white hover:bg-[#3c5144] disabled:hover:bg-ink";
export const secondaryButton = "inline-flex items-center justify-center gap-2 rounded-xl border border-[#dfe4dc] bg-white px-5 py-3 text-sm font-medium hover:bg-paper";
export const inputClass = "w-full rounded-xl border border-[#dce2d9] bg-white px-4 py-3 text-sm placeholder:text-[#a0a69e] focus:border-[#809b70]";

export function ErrorBanner({ message }: { message: string }) {
  return message ? <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"><Icon name="help" size={18} className="mt-0.5 shrink-0" />{message}</div> : null;
}

export function Loading({ label = "A little discovery is on its way…" }: { label?: string }) {
  return <div role="status" className="flex min-h-60 flex-col items-center justify-center gap-5 text-sm text-muted"><span className="h-7 w-7 animate-spin rounded-full border-2 border-[#dce5d6] border-t-ink" />{label}</div>;
}

export function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="mb-8 flex flex-wrap items-end justify-between gap-5"><div><p className="mb-3 text-[10px] font-semibold tracking-[.17em] text-muted uppercase">{eyebrow}</p><h1 className="text-[30px] leading-tight font-semibold tracking-[-1.1px] sm:text-[34px]">{title}</h1>{description && <p className="mt-3 text-sm leading-relaxed text-muted">{description}</p>}</div>{action}</div>;
}

export function Modal({ children, onClose, title }: { children: ReactNode; onClose: () => void; title: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { element?.close(); document.body.style.overflow = original; };
  }, []);
  return <dialog ref={dialog} aria-label={title} onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }} className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-32px)] max-w-[460px] overflow-y-auto rounded-3xl border-0 bg-paper p-7 text-ink shadow-2xl backdrop:bg-[#15261e]/40 backdrop:backdrop-blur-sm sm:p-9"><button aria-label="Close dialog" onClick={onClose} className="absolute top-5 right-5 rounded-full p-2 text-muted hover:bg-mint"><Icon name="close" size={18} /></button>{children}</dialog>;
}

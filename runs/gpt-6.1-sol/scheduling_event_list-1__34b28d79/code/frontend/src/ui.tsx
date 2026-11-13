import { useEffect, useId, useRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export const primaryButton = "inline-flex items-center justify-center gap-2 rounded-lg bg-forest px-4 py-2.5 text-[13px] font-semibold text-white shadow-sm hover:bg-forest-dark disabled:cursor-wait disabled:opacity-60";
export const secondaryButton = "inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-white px-4 py-2.5 text-[13px] font-medium text-ink hover:bg-sage disabled:cursor-wait disabled:opacity-60";
export const inputClass = "w-full rounded-lg border border-line bg-white px-3.5 py-3 text-sm text-ink outline-none placeholder:text-muted/70 focus:border-forest focus:ring-2 focus:ring-forest/10 disabled:opacity-60";

export function IconButton({ children, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={`inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-sage hover:text-forest disabled:opacity-40 ${className}`} {...props}>{children}</button>;
}

export function GatherMark({ className = "size-8" }: { className?: string }) {
  return <svg className={className} viewBox="0 0 40 40" fill="none" aria-hidden="true">
    <rect width="40" height="40" rx="12" fill="currentColor" />
    <path d="M20 20C8 22 7 8 14 9c6 0 6 11 6 11Zm0 0c-2-12 12-13 11-6 0 6-11 6-11 6Zm0 0c12-2 13 12 6 11-6 0-6-11-6-11Zm0 0c2 12-12 13-11 6 0-6 11-6 11-6Z" fill="#edf2e7" />
  </svg>;
}

export function BotanicalIllustration() {
  return <svg viewBox="0 0 200 160" className="mx-auto h-36 w-44" fill="none" aria-hidden="true">
    <path d="M45 144V70a55 55 0 0 1 110 0v74" fill="#e8eddd" />
    <circle cx="132" cy="46" r="19" fill="#d4dbaa" />
    <path d="M101 145V52m0 56-26-24m26 4 25-24m-25 62 24-19" stroke="#62754b" strokeWidth="2" strokeLinecap="round" />
    <path d="M101 78C83 73 84 52 100 44c11 13 13 25 1 34Z" fill="#5c7854" />
    <path d="M95 108C76 110 60 95 61 79c20-1 33 9 34 29Z" fill="#8ca37a" />
    <path d="M104 89c0-21 14-32 31-29 1 19-11 30-31 29Z" fill="#a7b691" />
    <path d="M103 128c0-16 12-26 27-23 0 15-10 24-27 23Z" fill="#71895d" />
    <path d="M82 144h39l-4 11H86l-4-11Z" fill="#c3cbb1" />
    <path d="M32 155h137" stroke="#c7cfbc" strokeWidth="1.5" strokeLinecap="round" />
    <path d="m40 62-5-5m6-12-6 3m130 62 6-4m-7-10 5 2" stroke="#a7b691" strokeWidth="1.5" strokeLinecap="round" />
  </svg>;
}

export function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () => Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]') || []).filter(element => element.offsetParent !== null);
    const frame = requestAnimationFrame(() => {
      const firstInput = ref.current?.querySelector<HTMLElement>("input, textarea");
      (firstInput || focusable()[0] || ref.current)?.focus();
    });
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
      if (event.key === "Tab") {
        const elements = focusable();
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", keydown);
      previousFocus?.focus();
    };
  }, []);
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-ink/30 p-4 backdrop-blur-[3px]" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className={`relative my-auto max-h-[92dvh] w-full overflow-y-auto rounded-2xl border border-white bg-paper shadow-2xl outline-none ${wide ? "max-w-xl" : "max-w-md"}`}>
        <div className="flex items-center justify-between border-b border-line px-6 py-5">
          <h2 id={titleId} className="text-lg font-semibold tracking-tight">{title}</h2>
          <IconButton onClick={onClose} aria-label="Close dialog"><X size={19} /></IconButton>
        </div>
        {children}
      </div>
    </div>, document.body,
  );
}

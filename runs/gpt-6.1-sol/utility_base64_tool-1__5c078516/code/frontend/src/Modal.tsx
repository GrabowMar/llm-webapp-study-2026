import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import Icon from "./icons";

export default function Modal({ children, onClose, title }: { children: ReactNode; onClose: () => void; title: string }) {
  const container = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);

  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () => container.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input, a[href], textarea, [tabindex='0']");
    focusable()?.[0]?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") closeRef.current();
      if (event.key === "Tab") {
        const elements = focusable();
        if (!elements?.length) return;
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, []);

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/35 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={container} role="dialog" aria-modal="true" aria-label={title} className="relative max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-line bg-paper p-7 shadow-2xl sm:p-9">
      <button type="button" onClick={onClose} aria-label="Close dialog" className="absolute right-4 top-4 rounded-lg p-2 text-muted transition-colors hover:bg-line hover:text-ink"><Icon name="close" /></button>
      {children}
    </div>
  </div>;
}

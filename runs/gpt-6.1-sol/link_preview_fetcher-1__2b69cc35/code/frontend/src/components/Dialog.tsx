import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export default function Dialog({ title, children, onClose, busy = false }: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);

  useEffect(() => {
    closeRef.current = onClose;
    busyRef.current = busy;
  }, [onClose, busy]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const panel = ref.current;
    (panel?.querySelector<HTMLElement>("input") ?? panel?.querySelector<HTMLElement>("button"))?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busyRef.current) closeRef.current();
      if (event.key === "Tab" && panel) {
        const elements = Array.from(panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), a[href], [tabindex="0"]',
        ));
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener("keydown", keydown);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", keydown);
      previous?.focus();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-5 backdrop-blur-sm" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onClose();
    }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} className="relative max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-line bg-paper p-7 shadow-2xl sm:p-9">
        <button aria-label="Close dialog" disabled={busy} onClick={onClose} className="absolute right-4 top-4 rounded-lg p-2 text-muted hover:bg-sidebar hover:text-ink disabled:opacity-40"><X size={19} /></button>
        <h2 id={titleId} className="pr-5 font-serif text-3xl tracking-tight">{title}</h2>
        {children}
      </div>
    </div>
  );
}

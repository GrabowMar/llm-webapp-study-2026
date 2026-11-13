import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import Icon from "./Icons";

export default function Modal({ title, children, onClose, busy = false }: { title: string; children: ReactNode; onClose: () => void; busy?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = original;
    };
  }, []);

  return (
    <dialog ref={ref} aria-label={title} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} onClick={event => { if (event.target === event.currentTarget && !busy) onClose(); }} className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-2xl border border-line bg-paper p-0 text-ink shadow-2xl">
      <div className="relative p-7 sm:p-9">
        <button type="button" aria-label="Close dialog" onClick={onClose} disabled={busy} className="absolute right-4 top-4 rounded-full p-2 text-muted transition hover:bg-leaf hover:text-ink"><Icon name="close" className="size-4" /></button>
        {children}
      </div>
    </dialog>
  );
}

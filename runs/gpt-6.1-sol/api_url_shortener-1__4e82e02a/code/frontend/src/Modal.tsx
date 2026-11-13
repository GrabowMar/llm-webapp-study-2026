import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import Icon from "./Icon";

export default function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = overflow;
    };
  }, []);

  return (
    <dialog ref={ref} aria-labelledby="modal-title" onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} className="fixed inset-0 m-auto w-[calc(100%_-_2rem)] max-w-md rounded-3xl border border-stone-200 bg-white p-0 text-ink shadow-2xl backdrop:bg-ink/35 backdrop:backdrop-blur-sm">
      <div className="relative p-7 sm:p-9">
        <button type="button" onClick={onClose} aria-label="Close dialog" className="absolute right-5 top-5 rounded-full p-2 text-stone-400 transition hover:bg-stone-100 hover:text-ink"><Icon name="x" /></button>
        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-mint text-forest"><Icon name="link" className="h-6 w-6" /></div>
        <h2 id="modal-title" className="pr-6 text-2xl font-semibold tracking-tight">{title}</h2>
        {children}
      </div>
    </dialog>
  );
}

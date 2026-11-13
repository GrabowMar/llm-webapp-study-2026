import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

interface ModalProps {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}

export default function Modal({ title, children, onClose, wide = false }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      className={`fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto rounded-2xl bg-paper p-0 text-ink shadow-2xl ${wide ? "max-w-5xl" : "max-w-md"}`}
    >
      <div className="relative" onClick={(event) => event.stopPropagation()}>
        <button onClick={onClose} aria-label="Close dialog" className="absolute right-4 top-4 z-10 rounded-full border border-line bg-paper/95 p-2 text-muted transition hover:text-ink"><X size={18} /></button>
        {children}
      </div>
    </dialog>
  );
}

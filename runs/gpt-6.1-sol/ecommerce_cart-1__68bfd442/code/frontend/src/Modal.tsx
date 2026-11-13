import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import { Icon } from "./Icons";

export function Modal({ title, onDismiss, children, drawer = false }: { title: string; onDismiss: () => void; children: ReactNode; drawer?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.showModal();
    dialog?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);
  return <dialog ref={ref} aria-labelledby={titleId} onCancel={onDismiss} onClick={(event) => { if (event.target === event.currentTarget) onDismiss(); }} className={`fixed bg-paper text-ink shadow-2xl backdrop:bg-ink/35 backdrop:backdrop-blur-sm ${drawer ? "inset-y-0 right-0 left-auto m-0 h-dvh max-h-dvh w-full max-w-[470px]" : "inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg rounded-xl"}`}>
    <div className={`flex flex-col ${drawer ? "h-full" : ""}`}>
      <div className="flex shrink-0 items-center justify-between border-b border-line px-7 py-6">
        <h2 id={titleId} className="font-serif text-2xl">{title}</h2>
        <button type="button" onClick={onDismiss} aria-label="Close dialog" className="rounded-full p-2 text-muted transition hover:bg-line/60 hover:text-ink"><Icon name="close" /></button>
      </div>
      {children}
    </div>
  </dialog>;
}

export function ErrorMessage({ message }: { message: string }) {
  return message ? <p role="alert" className="rounded-lg border border-rust/20 bg-rust/5 px-4 py-3 text-sm leading-relaxed text-rust-dark">{message}</p> : null;
}

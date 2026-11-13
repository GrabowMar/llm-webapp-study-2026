import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { AlertCircle, ArrowLeft, ArrowRight, Check, LoaderCircle, X } from "lucide-react";
import type { Item } from "./api";
import { number } from "./api";

export const inputClass = "w-full rounded-lg border border-[#dce3df] bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition placeholder:text-[#9aa5a0] focus:border-brand-500 focus:ring-3 focus:ring-brand-100 disabled:bg-gray-50";
export const primaryClass = "inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:opacity-50";
export const secondaryClass = "inline-flex items-center justify-center gap-2 rounded-lg border border-[#dce3df] bg-white px-4 py-2.5 text-sm font-medium text-[#4b5a53] shadow-xs transition hover:bg-[#f6f8f6] focus-visible:outline-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:opacity-40";

export function Modal({ title, subtitle, children, close, wide = false }: { title: string; subtitle?: string; children: ReactNode; close: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () => ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input, select, textarea, a[href], [tabindex="0"]');
    const firstInput = ref.current?.querySelector<HTMLElement>("input") || focusable()?.[0];
    firstInput?.focus();
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
      if (event.key === "Tab") {
        const elements = focusable();
        if (!elements?.length) return;
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handler);
      previous?.focus();
    };
  }, []);
  return <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#142a24]/40 p-4 backdrop-blur-[3px]" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
    <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="modal-title" className={`relative my-auto w-full ${wide ? "max-w-xl" : "max-w-md"} max-h-[90dvh] overflow-y-auto rounded-2xl border border-white/80 bg-white shadow-2xl`}>
      <div className="flex items-start justify-between border-b border-[#edf0ee] px-6 py-5">
        <div><h2 id="modal-title" className="text-xl font-semibold tracking-tight text-ink">{title}</h2>{subtitle && <p className="mt-1.5 text-sm text-[#7a8780]">{subtitle}</p>}</div>
        <button onClick={close} aria-label="Close dialog" className="ml-3 rounded-md p-1.5 text-[#8a958f] hover:bg-gray-100"><X size={20} /></button>
      </div>
      <div className="p-6">{children}</div>
    </div>
  </div>;
}

export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return <label className="block"><span className="mb-2 block text-sm font-medium text-[#415149]">{label}</span>{children}{error ? <span className="mt-1.5 block text-xs text-red-600">{error}</span> : hint ? <span className="mt-1.5 block text-xs text-[#8a958f]">{hint}</span> : null}</label>;
}

export function ErrorNotice({ message }: { message: string }) {
  return <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-red-100 bg-red-50 px-3.5 py-3 text-sm text-red-700"><AlertCircle size={17} className="mt-0.5 shrink-0" />{message}</div>;
}

export function Status({ item }: { item: Item }) {
  const style = item.quantity === 0 ? "bg-red-50 text-red-600" : item.low_stock ? "bg-[#fff2d9] text-[#ab7619]" : "bg-[#edf7ef] text-[#418555]";
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1 text-[11px] font-medium ${style}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{item.quantity === 0 ? "Out of stock" : item.low_stock ? "Low stock" : "In stock"}</span>;
}

export function Loading({ text = "Loading your inventory…" }: { text?: string }) {
  return <div className="flex min-h-48 items-center justify-center gap-3 text-sm text-[#7a8780]"><LoaderCircle size={20} className="animate-spin text-brand-600" />{text}</div>;
}

export function Pagination({ page, pageSize, total, setPage, setPageSize }: { page: number; pageSize: number; total: number; setPage: (page: number) => void; setPageSize: (size: number) => void }) {
  const count = Math.max(1, Math.ceil(total / pageSize));
  const pages = Array.from({ length: Math.min(5, count) }, (_, i) => Math.max(1, Math.min(page - 2, count - 4)) + i);
  return <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[#e9ede9] px-5 py-4 text-xs text-[#7e8983]">
    <span>Showing <span className="font-medium text-[#4b5a53]">{total ? number((page - 1) * pageSize + 1) : 0}–{number(Math.min(page * pageSize, total))}</span> of <span className="font-medium text-[#4b5a53]">{number(total)}</span> results</span>
    <div className="flex items-center gap-5"><select aria-label="Items per page" className="rounded-md border border-[#e1e7e2] bg-white px-2 py-1.5 text-xs outline-brand-500" value={pageSize} onChange={event => setPageSize(Number(event.target.value))}>{[10, 20, 50].map(size => <option key={size} value={size}>{size} / page</option>)}</select>
      <div className="flex items-center gap-1"><button aria-label="Previous page" onClick={() => setPage(page - 1)} disabled={page <= 1} className="rounded-md p-2 hover:bg-gray-50 disabled:opacity-35"><ArrowLeft size={14} /></button>{pages.map(value => <button key={value} aria-label={`Page ${value}`} aria-current={value === page ? "page" : undefined} onClick={() => setPage(value)} className={`h-7 w-7 rounded-md font-medium ${value === page ? "bg-brand-50 text-brand-700" : "hover:bg-gray-50"}`}>{value}</button>)}<button aria-label="Next page" onClick={() => setPage(page + 1)} disabled={page >= count} className="rounded-md p-2 hover:bg-gray-50 disabled:opacity-35"><ArrowRight size={14} /></button></div>
    </div>
  </div>;
}

export function Toast({ message, close }: { message: string; close: () => void }) {
  useEffect(() => { const timer = setTimeout(close, 4500); return () => clearTimeout(timer); }, [message, close]);
  return <div role="status" className="fixed bottom-6 left-1/2 z-[60] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-xl border border-brand-100 bg-white px-5 py-3.5 text-sm text-ink shadow-lg"><span className="shrink-0 rounded-full bg-brand-50 p-1 text-brand-600"><Check size={15} /></span>{message}<button onClick={close} aria-label="Dismiss notification" className="ml-4 shrink-0 text-gray-400"><X size={16} /></button></div>;
}

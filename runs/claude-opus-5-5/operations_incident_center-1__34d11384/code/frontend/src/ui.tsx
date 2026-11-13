import type { AnchorHTMLAttributes, ReactNode } from "react";
import type { Severity, Status } from "./api";
import { navigate } from "./router";

export function Link({ href, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return (
    <a
      href={href}
      {...rest}
      onClick={(e) => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        navigate(href);
      }}
    >
      {children}
    </a>
  );
}

const severityStyles: Record<Severity, string> = {
  sev1: "bg-red-100 text-red-800 ring-red-300",
  sev2: "bg-orange-100 text-orange-800 ring-orange-300",
  sev3: "bg-yellow-100 text-yellow-800 ring-yellow-300",
  sev4: "bg-sky-100 text-sky-800 ring-sky-300",
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold uppercase ring-1 ring-inset ${severityStyles[severity]}`}
    >
      {severity}
    </span>
  );
}

const statusStyles: Record<Status, string> = {
  investigating: "bg-red-50 text-red-700",
  identified: "bg-amber-50 text-amber-700",
  monitoring: "bg-blue-50 text-blue-700",
  resolved: "bg-green-50 text-green-700",
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusStyles[status]}`}>
      {status}
    </span>
  );
}

export function BreachedFlag() {
  return (
    <span
      className="inline-flex items-center gap-1 rounded bg-red-600 px-2 py-0.5 text-xs font-bold text-white"
      title="Resolution target missed"
    >
      SLA breached
    </span>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-slate-200 bg-white p-5 shadow-sm ${className}`}>{children}</div>;
}

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
      {message}
    </div>
  );
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-sm text-red-600">{message}</p>;
}

export const inputClass =
  "block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

export const buttonClass =
  "inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50";

export const secondaryButtonClass =
  "inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

export function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

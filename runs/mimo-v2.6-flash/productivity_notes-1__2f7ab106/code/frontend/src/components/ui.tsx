import type { ReactNode } from "react";

export function TagChip({
  children,
  active = false,
  onClick,
  size = "sm",
}: {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
  size?: "sm" | "md";
}) {
  const base =
    "inline-flex items-center rounded-full font-medium transition-colors cursor-pointer";
  const sizing = size === "md" ? "px-3 py-1 text-sm" : "px-2.5 py-0.5 text-xs";
  const tone = active
    ? "bg-indigo-600 text-white hover:bg-indigo-700"
    : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100";
  const className = `${base} ${sizing} ${tone}`;
  const label = <>#{children}</>;
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {label}
      </button>
    );
  }
  return <span className={className}>{label}</span>;
}

export function PinnedBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
      Pinned
    </span>
  );
}

export function ErrorAlert({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
    >
      {message}
    </p>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <p className="flex items-center gap-2 text-sm text-slate-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" />
      {label}
    </p>
  );
}

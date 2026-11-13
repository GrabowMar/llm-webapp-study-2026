import type { Link } from "../types";

export function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => fallback(text));
  } else {
    fallback(text);
  }
}

function fallback(text: string) {
  const el = document.createElement("textarea");
  el.value = text;
  document.body.appendChild(el);
  el.select();
  document.execCommand("copy");
  el.remove();
}

interface RowProps {
  link: Link;
  absolute: string;
  showOwner?: boolean;
  canDelete?: boolean;
  canToggle?: boolean;
  busy?: boolean;
  confirming?: boolean;
  onConfirm?: () => void;
  onCancelConfirm?: () => void;
  onDelete?: (link: Link) => void;
  onToggle?: (link: Link) => void;
}

export default function LinkRow({
  link,
  absolute,
  showOwner = false,
  canDelete = false,
  canToggle = false,
  busy = false,
  confirming = false,
  onConfirm,
  onCancelConfirm,
  onDelete,
  onToggle,
}: RowProps) {
  const truncated =
    link.original_url.length > 60 ? `${link.original_url.slice(0, 60)}…` : link.original_url;
  const date = new Date(link.created_at).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <div
      className={`flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
        link.active === false ? "bg-slate-50" : ""
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={absolute}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-sm font-semibold text-indigo-700 hover:underline"
          >
            {absolute}
          </a>
          <button
            type="button"
            onClick={() => copyText(absolute)}
            className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
          >
            Copy
          </button>
          {showOwner && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              {link.owner}
            </span>
          )}
          {link.active === false && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
              Disabled
            </span>
          )}
        </div>
        <p className="mt-1 truncate text-xs text-slate-500" title={link.original_url}>
          {truncated}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-4 text-xs text-slate-500">
        <span className="tabular-nums">
          {link.click_count} click{link.click_count === 1 ? "" : "s"}
        </span>
        <span className="tabular-nums">{date}</span>
        {canToggle && (
          <button
            type="button"
            onClick={() => onToggle?.(link)}
            disabled={busy}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold text-white shadow-sm disabled:opacity-50 ${
              link.active === false
                ? "bg-emerald-600 hover:bg-emerald-500"
                : "bg-amber-600 hover:bg-amber-500"
            }`}
          >
            {link.active === false ? "Enable" : "Disable"}
          </button>
        )}
        {canDelete &&
          (confirming ? (
            <span className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-600">Delete?</span>
              <button
                type="button"
                onClick={onConfirm}
                disabled={busy}
                className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-red-500 disabled:opacity-50"
              >
                Yes
              </button>
              <button
                type="button"
                onClick={onCancelConfirm}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                No
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => onDelete?.(link)}
              disabled={busy}
              className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-red-500 disabled:opacity-50"
            >
              Delete
            </button>
          ))}
      </div>
    </div>
  );
}

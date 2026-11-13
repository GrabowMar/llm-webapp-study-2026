import { useEffect, useState } from "react";
import { api, type Link } from "../api";
import { copyText } from "../clipboard";

type Props = {
  link: Link;
  isOwner: boolean;
  isAdmin: boolean;
  onChanged: () => void;
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function LinkRow({ link, isOwner, isAdmin, onChanged }: Props) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const shortUrl = `${window.location.origin}${link.short_url}`;

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await copyText(shortUrl);
      setCopied(true);
    } catch {
      setError("Copy failed");
    }
  }

  async function remove() {
    if (!window.confirm("Delete this link permanently?")) return;
    setBusy(true);
    setError("");
    try {
      await api.deleteLink(link.id);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  async function toggle() {
    setBusy(true);
    setError("");
    try {
      await api.adminToggleLink(link.id);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li
      className={`rounded-xl border p-4 ${
        link.disabled
          ? "border-slate-800 bg-slate-950/60 opacity-70"
          : "border-slate-800 bg-slate-900/60"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={link.short_url}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-sm font-semibold text-indigo-400 hover:text-indigo-300"
            >
              {window.location.host}
              {link.short_url}
            </a>
            <button
              type="button"
              onClick={copy}
              className="rounded border border-slate-700 px-2 py-0.5 text-xs text-slate-300 transition hover:border-indigo-500 hover:text-white"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
            {link.disabled && (
              <span className="rounded bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-400">
                Disabled
              </span>
            )}
          </div>
          <p
            className="mt-1 truncate text-sm text-slate-400"
            title={link.original_url}
          >
            {link.original_url}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
            <span>{link.click_count} clicks</span>
            <span>{formatDate(link.created_at)}</span>
            {isAdmin && <span>by {link.owner}</span>}
          </div>
          {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
        </div>
        <div className="flex shrink-0 gap-2">
          {isAdmin && (
            <button
              type="button"
              onClick={toggle}
              disabled={busy}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-indigo-500 disabled:opacity-50"
            >
              {link.disabled ? "Re-enable" : "Disable"}
            </button>
          )}
          {isOwner && !link.disabled && (
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-500/10 disabled:opacity-50"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

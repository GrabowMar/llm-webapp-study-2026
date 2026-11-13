import { useState } from "react";
import { api, ApiError } from "../api";
import type { Link } from "../types";

interface ShortenFormProps {
  onCreated: (link: Link) => void;
}

function absoluteUrl(shortUrl: string): string {
  return new URL(shortUrl, window.location.origin).href;
}

export default function ShortenForm({ onCreated }: ShortenFormProps) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Link | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setCopied(false);
    setBusy(true);
    try {
      const link = await api.createLink(url.trim());
      setResult(link);
      setUrl("");
      onCreated(link);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!result) return;
    const href = absoluteUrl(result.short_url);
    try {
      await navigator.clipboard.writeText(href);
    } catch {
      const el = document.createElement("textarea");
      el.value = href;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      el.remove();
    }
    setCopied(true);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 text-base font-semibold text-slate-800">Shorten a link</h2>
      <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/a-very-long-address"
          required
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-50"
        >
          {busy ? "Shortening…" : "Shorten"}
        </button>
      </form>
      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      {result && (
        <div className="mt-3 flex flex-col gap-2 rounded-lg bg-indigo-50 px-3 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between">
          <a
            href={absoluteUrl(result.short_url)}
            target="_blank"
            rel="noreferrer"
            className="font-mono font-medium text-indigo-700 hover:underline"
          >
            {absoluteUrl(result.short_url)}
          </a>
          <button
            type="button"
            onClick={copy}
            className="shrink-0 rounded-md border border-indigo-300 bg-white px-3 py-1 font-medium text-indigo-700 shadow-sm hover:bg-indigo-100"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      )}
    </div>
  );
}

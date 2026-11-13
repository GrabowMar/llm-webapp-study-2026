import { useState, type FormEvent } from "react";
import { api, type Link } from "../api";
import { copyText } from "../clipboard";

type Props = {
  onCreated: (link: Link) => void;
};

export default function ShortenForm({ onCreated }: Props) {
  const [url, setUrl] = useState("");
  const [created, setCreated] = useState<Link | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setCopied(false);
    setBusy(true);
    try {
      const link = await api.createLink(url);
      setCreated(link);
      setUrl("");
      onCreated(link);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not shorten URL");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!created) return;
    try {
      await copyText(`${window.location.origin}${created.short_url}`);
      setCopied(true);
    } catch {
      setError("Copy failed");
    }
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl shadow-black/20">
      <h2 className="mb-4 text-lg font-semibold text-white">Shorten a URL</h2>
      <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/very/long/link"
          required
          className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-indigo-500"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-indigo-500 px-5 py-2 font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-50"
        >
          {busy ? "Shortening..." : "Shorten"}
        </button>
      </form>

      {error && (
        <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      )}

      {created && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2">
          <span className="text-sm text-emerald-300">Short link:</span>
          <a
            href={created.short_url}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-sm text-emerald-400 underline decoration-emerald-500/40"
          >
            {window.location.origin}
            {created.short_url}
          </a>
          <button
            type="button"
            onClick={copy}
            className="rounded border border-emerald-500/40 px-2 py-0.5 text-xs text-emerald-300 transition hover:bg-emerald-500/10"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      )}
    </div>
  );
}

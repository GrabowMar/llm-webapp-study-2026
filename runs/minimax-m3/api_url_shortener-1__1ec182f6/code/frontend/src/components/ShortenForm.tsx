import { useState } from "react";
import { absoluteShortUrl, api, errorMessage } from "../api";
import type { Link } from "../types";
import CopyButton from "./CopyButton";

type ShortenFormProps = {
  onCreated: () => void;
};

export default function ShortenForm({ onCreated }: ShortenFormProps) {
  const [url, setUrl] = useState("");
  const [created, setCreated] = useState<Link | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setCreated(null);
    setBusy(true);
    try {
      const link = await api.createLink(url.trim());
      setCreated(link);
      setUrl("");
      onCreated();
    } catch (err) {
      setError(errorMessage(err, "The link could not be created."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-lg shadow-slate-950/40">
      <h2 className="text-lg font-semibold text-white">Shorten a long address</h2>
      <p className="mt-1 text-sm text-slate-400">
        Paste an http or https address and get a short link you can share.
      </p>

      <form className="mt-5 flex flex-col gap-3 sm:flex-row" onSubmit={handleSubmit}>
        <input
          type="text"
          value={url}
          required
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://example.com/a/very/long/address"
          aria-label="Long address"
          className="w-full flex-1 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30"
        />
        <button
          type="submit"
          disabled={busy}
          className="shrink-0 rounded-lg bg-indigo-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Shortening..." : "Shorten"}
        </button>
      </form>

      {error ? (
        <p className="mt-4 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          {error}
        </p>
      ) : null}

      {created ? (
        <div className="mt-4 flex flex-col gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-300/80">
              Your short link
            </p>
            <a
              href={absoluteShortUrl(created)}
              className="mt-1 block break-all font-mono text-sm text-emerald-200 underline decoration-emerald-500/40 underline-offset-4 hover:text-white"
            >
              {absoluteShortUrl(created)}
            </a>
          </div>
          <CopyButton value={absoluteShortUrl(created)} className="shrink-0" />
        </div>
      ) : null}
    </section>
  );
}

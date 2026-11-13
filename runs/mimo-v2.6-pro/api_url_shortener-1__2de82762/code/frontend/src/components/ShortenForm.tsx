import { useState } from "react";
import type { FormEvent } from "react";
import { api } from "../api";
import { shortAddress } from "../api";
import type { Link } from "../api";

interface ShortenFormProps {
  token: string;
  onCreated: () => void;
}

export default function ShortenForm({ token, onCreated }: ShortenFormProps) {
  const [url, setUrl] = useState("");
  const [created, setCreated] = useState<Link | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const link = await api.createLink(url.trim(), token);
      setCreated(link);
      setUrl("");
      onCreated();
    } catch (err) {
      setCreated(null);
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!created) return;
    const text = shortAddress(created);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Shorten a link</h2>
      <p className="mt-1 text-sm text-slate-500">
        Paste an http or https address to get a short link you can share.
      </p>

      <form onSubmit={submit} className="mt-4 flex flex-col gap-3 sm:flex-row">
        <input
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          placeholder="https://example.com/very/long/address"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Shortening..." : "Shorten"}
        </button>
      </form>

      {created ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
          <a
            href={created.short_url}
            className="font-medium text-indigo-700 hover:underline"
          >
            {shortAddress(created)}
          </a>
          <button
            type="button"
            onClick={copy}
            className="rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-sm font-medium text-indigo-700 shadow-sm hover:bg-indigo-50"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </section>
  );
}

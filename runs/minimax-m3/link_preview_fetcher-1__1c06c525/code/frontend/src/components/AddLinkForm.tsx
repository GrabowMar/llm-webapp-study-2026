import { useState, type FormEvent } from "react";
import { ApiError, api } from "../api";
import type { Preview } from "../types";

type AddLinkFormProps = {
  onAdded: (preview: Preview) => void;
};

export default function AddLinkForm({ onAdded }: AddLinkFormProps) {
  const [url, setUrl] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const value = url.trim();
    if (!value) return;
    setError(null);
    setPending(true);
    try {
      const preview = await api.createPreview(value);
      setUrl("");
      onAdded(preview);
    } catch (caught) {
      setError(
        caught instanceof ApiError || caught instanceof Error
          ? caught.message
          : "Could not add that link.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <label className="block text-sm font-medium text-slate-700" htmlFor="link-url">
        Link
      </label>
      <form className="mt-2 flex flex-col gap-3 sm:flex-row" onSubmit={handleSubmit}>
        <input
          id="link-url"
          name="url"
          type="text"
          inputMode="url"
          placeholder="https://example.com"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          aria-busy={pending}
          className="w-full flex-1 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
        />
        <button
          type="submit"
          disabled={pending || url.trim().length === 0}
          aria-busy={pending}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 py-2 font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? (
            <>
              <span
                aria-hidden="true"
                className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
              />
              Adding…
            </>
          ) : (
            "Add"
          )}
        </button>
      </form>
      {error ? (
        <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
    </section>
  );
}

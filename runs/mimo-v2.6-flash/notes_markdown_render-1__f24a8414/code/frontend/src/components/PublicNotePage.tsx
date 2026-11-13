import { useEffect, useState } from "react";
import { ApiError, Note, api, fetchText, formatDate } from "../api";

type Props = {
  noteId: number;
  onHome: () => void;
};

export default function PublicNotePage({ noteId, onHome }: Props) {
  const [note, setNote] = useState<Note | null>(null);
  const [html, setHtml] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setNote(null);
      try {
        const meta = await api<Note>(`/api/public/notes/${noteId}`, { auth: false });
        const rendered = await fetchText(`/api/public/notes/${noteId}/html`);
        if (cancelled) return;
        setNote(meta);
        setHtml(rendered);
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 404) {
          setError("This note doesn't exist or isn't published.");
        } else {
          setError(e instanceof Error ? e.message : "Could not load note.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [noteId, reloadKey]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <button
            type="button"
            onClick={onHome}
            className="text-sm font-semibold tracking-tight hover:text-indigo-700"
          >
            Markdown Notes
          </button>
          <button
            type="button"
            onClick={onHome}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Open app
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10">
        {loading && <p className="text-sm text-slate-500">Loading note…</p>}

        {error && (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
            <h1 className="text-lg font-semibold text-slate-900">Note unavailable</h1>
            <p className="mt-2 text-sm text-slate-500">{error}</p>
            <div className="mt-5 flex justify-center gap-2">
              <button
                type="button"
                onClick={() => setReloadKey((k) => k + 1)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={onHome}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
              >
                Go to app
              </button>
            </div>
          </div>
        )}

        {note && !loading && (
          <article>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              {note.title.trim() || "Untitled"}
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              by {note.author} · Updated {formatDate(note.updated_at)}
            </p>
            <div className="mt-8 border-t border-slate-200 pt-8">
              <div
                className="prose prose-slate max-w-none"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            </div>
          </article>
        )}
      </main>
    </div>
  );
}

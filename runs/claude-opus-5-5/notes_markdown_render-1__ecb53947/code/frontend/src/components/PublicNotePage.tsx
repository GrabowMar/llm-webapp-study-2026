import { useEffect, useState } from "react";
import { api, ApiError, formatDate, type PublicNote } from "../api";

export default function PublicNotePage({ id }: { id: number }) {
  const [note, setNote] = useState<PublicNote | null>(null);
  const [html, setHtml] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setNote(null);
    setError(null);
    Promise.all([api.publicNote(id), api.publicNoteHtml(id)])
      .then(([n, h]) => {
        if (cancelled) return;
        setNote(n);
        setHtml(h);
        document.title = `${n.title || "Untitled"} · Markdown Notes`;
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError && err.status === 404
            ? "This note does not exist or is not published."
            : "Could not load this note.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <a href="/" className="font-semibold text-slate-800 hover:text-indigo-600">
            Markdown Notes
          </a>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10">
        {error ? (
          <p role="alert" className="rounded-md bg-red-50 px-4 py-3 text-red-700">
            {error}
          </p>
        ) : !note ? (
          <p className="text-slate-500">Loading…</p>
        ) : (
          <article className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
            <h1 className="mb-2 text-3xl font-bold text-slate-900">{note.title || "Untitled"}</h1>
            <p className="mb-8 text-sm text-slate-500">
              by <span className="font-medium text-slate-700">{note.author}</span>
              {" · "}
              <time dateTime={note.updated_at}>{formatDate(note.updated_at)}</time>
            </p>
            <div
              className="prose prose-slate max-w-none"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </article>
        )}
      </main>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError, api, type PublicNote } from "./api";
import { Spinner, formatDate } from "./components";

export default function PublicNotePage() {
  const { id } = useParams();
  const noteId = Number(id);
  const [note, setNote] = useState<PublicNote | null>(null);
  const [html, setHtml] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    Promise.all([api.getPublicNote(noteId), api.publicNoteHtml(noteId)])
      .then(([meta, rendered]) => {
        if (cancelled) return;
        setNote(meta);
        setHtml(rendered);
      })
      .catch((err) => {
        if (!cancelled)
          setError(
            err instanceof ApiError && err.status === 404
              ? "This note is not published or does not exist."
              : err instanceof Error
                ? err.message
                : "Could not load note",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [noteId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Spinner label="Loading note…" />
      </div>
    );
  }

  if (error || !note) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-semibold text-slate-900">Note unavailable</h1>
          <p className="mt-2 text-sm text-slate-500">{error}</p>
          <Link
            to="/"
            className="mt-5 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Go to Markdown Notes
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
              M
            </span>
            <span className="text-sm font-semibold tracking-tight">
              Markdown Notes
            </span>
          </Link>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
            Published
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10">
        <article className="rounded-2xl border border-slate-200 bg-white px-6 py-8 shadow-sm sm:px-10">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            {note.title || "Untitled note"}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            By{" "}
            <span className="font-medium text-slate-700">{note.author}</span>
            <span className="mx-2 text-slate-300">·</span>
            <span>Updated {formatDate(note.updated_at)}</span>
          </p>
          <hr className="my-6 border-slate-200" />
          <div
            className="prose prose-slate max-w-none"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </article>
      </main>
    </div>
  );
}

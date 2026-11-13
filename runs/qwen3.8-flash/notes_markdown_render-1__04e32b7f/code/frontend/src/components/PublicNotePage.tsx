import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";
import type { NoteSummary } from "../types";
import { formatDate } from "../util";

export default function PublicNotePage() {
  const { id } = useParams<{ id: string }>();
  const [note, setNote] = useState<NoteSummary | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "gone">("loading");

  useEffect(() => {
    let alive = true;
    const noteId = Number(id);
    if (!Number.isInteger(noteId) || noteId <= 0) {
      setStatus("gone");
      return;
    }
    Promise.all([api.publicNote(noteId), api.publicNoteHtml(noteId)])
      .then(([meta, rendered]) => {
        if (!alive) return;
        setNote(meta);
        setHtml(rendered);
        setStatus("ok");
      })
      .catch(() => alive && setStatus("gone"));
    return () => {
      alive = false;
    };
  }, [id]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <a href="/" className="font-bold text-slate-900 hover:text-indigo-700">
            Markdown Notes
          </a>
          <span className="text-xs font-semibold uppercase tracking-wide text-emerald-600">
            Public note
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">
        {status === "loading" && <p className="text-sm text-slate-500">Loading…</p>}
        {status === "gone" && (
          <div className="rounded-xl bg-white p-8 text-center shadow">
            <h1 className="text-xl font-bold text-slate-800">Note not found</h1>
            <p className="mt-2 text-sm text-slate-500">
              This note does not exist or is not published.
            </p>
          </div>
        )}
        {status === "ok" && note && (
          <article className="rounded-xl bg-white p-6 shadow sm:p-8">
            <h1 className="text-2xl font-bold text-slate-900">{note.title || "Untitled"}</h1>
            <p className="mt-1 text-sm text-slate-500">
              by <span className="font-medium text-slate-700">{note.author}</span>
              {" · updated "}
              {formatDate(note.updated_at)}
            </p>
            <div
              className="prose prose-slate mt-6 max-w-none"
              dangerouslySetInnerHTML={{ __html: html ?? "" }}
            />
          </article>
        )}
      </main>
    </div>
  );
}

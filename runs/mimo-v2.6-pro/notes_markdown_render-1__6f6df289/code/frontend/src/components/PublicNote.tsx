import { useEffect, useState } from "react";
import { fetchPublicNote, fetchPublicNoteHtml } from "../api";
import type { PublicNote as PublicNoteData } from "../types";

interface Props {
  noteId: number;
}

export default function PublicNote({ noteId }: Props) {
  const [note, setNote] = useState<PublicNoteData | null>(null);
  const [html, setHtml] = useState("");
  const [state, setState] = useState<"loading" | "ok" | "missing">("loading");

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchPublicNote(noteId), fetchPublicNoteHtml(noteId)])
      .then(([meta, body]) => {
        if (cancelled) return;
        setNote(meta);
        setHtml(body);
        setState("ok");
      })
      .catch(() => {
        if (!cancelled) setState("missing");
      });
    return () => {
      cancelled = true;
    };
  }, [noteId]);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center px-4 py-3">
          <a href="/" className="text-lg font-bold tracking-tight text-slate-900">
            Markdown Notes
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        {state === "loading" && (
          <p className="text-sm text-slate-500">Loading note…</p>
        )}

        {state === "missing" && (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <p className="text-slate-700">
              This note does not exist or has not been published.
            </p>
            <a
              href="/"
              className="mt-4 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
            >
              Go to Markdown Notes
            </a>
          </div>
        )}

        {state === "ok" && note && (
          <article className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              {note.title || "Untitled note"}
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              by{" "}
              <span className="font-medium text-slate-700">{note.author}</span>
              {" · "}
              {new Date(note.updated_at).toLocaleDateString(undefined, {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
            <hr className="my-6 border-slate-200" />
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

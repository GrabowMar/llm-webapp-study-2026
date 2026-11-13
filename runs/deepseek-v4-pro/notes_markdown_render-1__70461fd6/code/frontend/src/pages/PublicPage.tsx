import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getPublicNote, renderPublicNote, type PublicNoteMeta } from "../api";

export function PublicPage() {
  const { id } = useParams<{ id: string }>();
  const noteId = Number(id);
  const [note, setNote] = useState<PublicNoteMeta | null>(null);
  const [html, setHtml] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    getPublicNote(noteId)
      .then((n) => {
        setNote(n);
        return renderPublicNote(noteId);
      })
      .then(setHtml)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load note"),
      );
  }, [noteId]);

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl border border-slate-200 p-8 max-w-md text-center">
          <h1 className="text-xl font-bold text-slate-900 mb-2">Not available</h1>
          <p className="text-slate-500 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!note) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-500">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <h1 className="text-3xl font-bold text-slate-900">{note.title || "Untitled"}</h1>
          <p className="text-sm text-slate-500 mt-1">by {note.author}</p>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-8">
        <article className="bg-white rounded-xl border border-slate-200 p-6">
          <div
            className="markdown-body"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </article>
      </main>
    </div>
  );
}

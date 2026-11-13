import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { formatDate } from "../components/NoteCard";
import { deleteNote, getNote, type Note } from "../lib/api";
import { useAuth } from "../lib/auth";

export function NoteDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { username, isSignedIn } = useAuth();

  const [note, setNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    getNote(Number(id))
      .then(setNote)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const isAuthor = note !== null && username !== null && note.author === username;

  async function handleDelete() {
    if (!note) return;
    setDeleting(true);
    try {
      await deleteNote(note.id);
      navigate("/");
    } catch (err) {
      setError((err as Error).message);
      setDeleting(false);
      setConfirming(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10">
        <p className="text-sm text-slate-500">Loading note…</p>
      </div>
    );
  }

  if (error || !note) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10">
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error ?? "Note not found"}
        </div>
        <Link to="/" className="mt-4 inline-block text-sm text-indigo-700 hover:underline">
          ← Back to all notes
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <Link to="/" className="text-sm text-indigo-700 hover:underline">
        ← Back to all notes
      </Link>

      <article className="mt-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {note.title}
          </h1>
          {note.pinned ? (
            <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
              Pinned
            </span>
          ) : null}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          <span>
            by <span className="font-medium text-slate-700">{note.author}</span>
          </span>
          <span aria-hidden="true">·</span>
          <span>Created {formatDate(note.created_at)}</span>
          <span aria-hidden="true">·</span>
          <span>Updated {formatDate(note.updated_at)}</span>
        </div>

        {note.tags.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {note.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600"
              >
                #{tag}
              </span>
            ))}
          </div>
        ) : null}

        <div className="mt-6 border-t border-slate-100 pt-6">
          <p className="whitespace-pre-wrap break-words text-base leading-relaxed text-slate-800">
            {note.content}
          </p>
        </div>
      </article>

      {isAuthor ? (
        <div className="mt-4 flex items-center gap-3">
          <Link
            to={`/notes/${note.id}/edit`}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Edit
          </Link>
          {confirming ? (
            <span className="flex items-center gap-2">
              <span className="text-sm text-slate-600">Delete this note?</span>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-rose-700 disabled:opacity-60"
              >
                {deleting ? "Deleting…" : "Yes, delete"}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={deleting}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="rounded-lg border border-rose-300 px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-50"
            >
              Delete
            </button>
          )}
        </div>
      ) : isSignedIn ? (
        <p className="mt-4 text-sm text-slate-500">
          Only {note.author} can change or delete this note.
        </p>
      ) : null}
    </div>
  );
}

import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { deleteNote, getNote, ApiError, type Note } from "../api";
import { useAuth } from "../auth";

export function NotePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { username } = useAuth();
  const [note, setNote] = useState<Note | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let alive = true;
    getNote(Number(id))
      .then((n) => alive && setNote(n))
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [id]);

  async function onDelete() {
    try {
      await deleteNote(Number(id));
      navigate("/");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Delete failed");
    }
  }

  if (error) {
    return <p className="text-red-700">{error}</p>;
  }

  if (!note) {
    return <p className="text-slate-500">Loading…</p>;
  }

  const isAuthor = username !== null && username === note.author;

  return (
    <div>
      <Link to="/" className="text-sm text-slate-500 hover:underline">
        ← Back to notes
      </Link>

      <div className="mt-4 rounded-lg border border-slate-200 bg-white p-6">
        <div className="flex items-start justify-between">
          <h1 className="text-2xl font-bold">{note.title}</h1>
          {note.pinned && (
            <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
              Pinned
            </span>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500">
          {note.tags.map((t) => (
            <span key={t} className="rounded bg-slate-100 px-2 py-0.5">
              {t}
            </span>
          ))}
        </div>

        <p className="mt-1 text-xs text-slate-400">
          by {note.author} · updated {new Date(note.updated_at).toLocaleString()}
        </p>

        <pre className="mt-4 whitespace-pre-wrap font-sans text-slate-800">
          {note.content}
        </pre>
      </div>

      {isAuthor && (
        <div className="mt-4 flex gap-3">
          <Link
            to={`/notes/${note.id}/edit`}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100"
          >
            Edit
          </Link>
          {confirming ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-600">Delete this note?</span>
              <button
                onClick={onDelete}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500"
              >
                Confirm
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
            >
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { api, type Note } from "../api";
import { useAuth } from "../auth";
import { Alert, PinBadge, TagChip, btnDanger, btnSecondary, formatDate } from "../components/ui";
import { Link, navigate } from "../router";

export default function NoteView({ id }: { id: number }) {
  const { username } = useAuth();
  const [note, setNote] = useState<Note | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setNote(null);
    setError(null);
    api
      .getNote(id)
      .then((n) => !cancelled && setNote(n))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error && !note) {
    return (
      <div className="space-y-4">
        <Alert>{error}</Alert>
        <Link to="/" className="text-indigo-600 hover:underline">
          ← Back to notes
        </Link>
      </div>
    );
  }
  if (!note) return <p className="text-slate-500">Loading…</p>;

  const isOwner = username !== null && username.toLowerCase() === note.author.toLowerCase();

  const onDelete = async () => {
    if (!window.confirm(`Delete “${note.title}”? This cannot be undone.`)) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteNote(note.id);
      navigate("/");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const togglePin = async () => {
    setBusy(true);
    setError(null);
    try {
      setNote(await api.updateNote(note.id, { pinned: !note.pinned }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="space-y-4">
      <Link to="/" className="text-sm text-indigo-600 hover:underline">
        ← Back to notes
      </Link>
      {error && <Alert>{error}</Alert>}
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold break-words text-slate-900">{note.title}</h1>
            <p className="mt-1 text-sm text-slate-500">
              by{" "}
              <Link to={`/?author=${encodeURIComponent(note.author)}`} className="font-medium text-slate-700 hover:text-indigo-600">
                {note.author}
              </Link>{" "}
              · created {formatDate(note.created_at)}
              {note.updated_at !== note.created_at && <> · updated {formatDate(note.updated_at)}</>}
            </p>
          </div>
          {note.pinned && <PinBadge />}
        </header>
        {note.tags.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-1.5">
            {note.tags.map((t) => (
              <TagChip key={t} tag={t} />
            ))}
          </div>
        )}
        {note.content ? (
          <div className="text-slate-800 break-words whitespace-pre-wrap">{note.content}</div>
        ) : (
          <p className="text-slate-400 italic">No content.</p>
        )}
      </div>
      {isOwner && (
        <div className="flex flex-wrap gap-2">
          <Link to={`/notes/${note.id}/edit`} className={btnSecondary}>
            Edit
          </Link>
          <button type="button" className={btnSecondary} onClick={togglePin} disabled={busy}>
            {note.pinned ? "Unpin" : "Pin"}
          </button>
          <button type="button" className={btnDanger} onClick={onDelete} disabled={busy}>
            Delete
          </button>
        </div>
      )}
    </article>
  );
}

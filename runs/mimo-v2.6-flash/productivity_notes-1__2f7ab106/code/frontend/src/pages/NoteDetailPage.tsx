import { useEffect, useState } from "react";
import { api, ApiError, type Note } from "../api";
import { ErrorAlert, PinnedBadge, Spinner, TagChip } from "../components/ui";
import { formatDate } from "../format";

type Props = {
  noteId: number;
  username: string | null;
  onBack: () => void;
  onEdit: (id: number) => void;
  onChanged: () => void;
};

export default function NoteDetailPage({ noteId, username, onBack, onEdit, onChanged }: Props) {
  const [note, setNote] = useState<Note | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setConfirming(false);
    setActionError(null);
    api
      .getNote(noteId)
      .then((res) => {
        if (!cancelled) {
          setNote(res);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Failed to load the note.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [noteId]);

  async function remove() {
    if (!note) return;
    setDeleting(true);
    setActionError(null);
    try {
      await api.deleteNote(note.id);
      onChanged();
      onBack();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Failed to delete the note.");
      setConfirming(false);
    } finally {
      setDeleting(false);
    }
  }

  if (loading && !note) {
    return <Spinner label="Loading note…" />;
  }

  if (!note) {
    return (
      <div className="space-y-4">
        <ErrorAlert message={error} />
        <button
          type="button"
          onClick={onBack}
          className="text-sm font-medium text-indigo-600 hover:underline"
        >
          ← Back to notes
        </button>
      </div>
    );
  }

  const isAuthor = username !== null && note.author === username;

  return (
    <article className="mx-auto max-w-3xl">
      <button
        type="button"
        onClick={onBack}
        className="mb-4 text-sm font-medium text-indigo-600 hover:underline"
      >
        ← Back to notes
      </button>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-2xl font-bold text-slate-900">{note.title}</h1>
          {note.pinned && <PinnedBadge />}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 text-sm text-slate-500">
          <span className="font-medium text-slate-700">{note.author}</span>
          <span>created {formatDate(note.created_at)}</span>
          <span>updated {formatDate(note.updated_at)}</span>
        </div>

        {note.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {note.tags.map((tag) => (
              <TagChip key={tag}>{tag}</TagChip>
            ))}
          </div>
        )}

        <div className="mt-5 whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-800">
          {note.content}
        </div>

        {isAuthor && (
          <div className="mt-6 border-t border-slate-200 pt-4">
            <ErrorAlert message={actionError} />
            {confirming ? (
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm text-slate-600">Delete this note permanently?</p>
                <button
                  type="button"
                  onClick={remove}
                  disabled={deleting}
                  className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                >
                  {deleting ? "Deleting…" : "Yes, delete"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={deleting}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => onEdit(note.id)}
                  className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

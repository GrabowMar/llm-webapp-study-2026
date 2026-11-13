import { useEffect, useState } from "react";
import { api, type Note, type ValidationError } from "../api";
import { useAuth } from "../auth";
import { navigate } from "../router";

interface Props {
  noteId?: number;
  onChanged: () => void;
}

export default function NoteForm({ noteId, onChanged }: Props) {
  const { token } = useAuth();
  const editing = noteId !== undefined;

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");
  const [pinned, setPinned] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(editing);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!editing) return;
    let cancelled = false;
    setLoading(true);
    api<Note>(`/api/notes/${noteId}`)
      .then((note) => {
        if (cancelled) return;
        setTitle(note.title);
        setContent(note.content);
        setTags(note.tags.join(", "));
        setPinned(note.pinned);
      })
      .catch((err: ValidationError) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [editing, noteId]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setFieldErrors({});

    const payload = {
      title,
      content,
      pinned,
      tags: tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    };

    try {
      if (editing) {
        const updated = await api<Note>(`/api/notes/${noteId}`, {
          method: "PATCH",
          body: payload,
          token,
        });
        onChanged();
        navigate(`/notes/${updated.id}`);
      } else {
        const created = await api<Note>("/api/notes", {
          method: "POST",
          body: payload,
          token,
        });
        onChanged();
        navigate(`/notes/${created.id}`);
      }
    } catch (err) {
      const failure = err as ValidationError;
      setError(failure.message);
      setFieldErrors(failure.fields ?? {});
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <p className="py-10 text-center text-sm text-slate-400">Loading note…</p>;
  }

  return (
    <div className="mx-auto max-w-2xl">
      <form
        onSubmit={submit}
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h1 className="text-2xl font-bold text-slate-900">
          {editing ? "Edit note" : "New note"}
        </h1>

        {error && (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        )}

        <div className="mt-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
            {fieldErrors.title && (
              <p className="mt-1 text-xs text-rose-600">{fieldErrors.title}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Content</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={10}
              className="mt-1 w-full resize-y rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
            {fieldErrors.content && (
              <p className="mt-1 text-xs text-rose-600">{fieldErrors.content}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Tags</label>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="comma, separated, tags"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
            <p className="mt-1 text-xs text-slate-400">
              Separate tags with commas.
            </p>
            {fieldErrors.tags && (
              <p className="mt-1 text-xs text-rose-600">{fieldErrors.tags}</p>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={pinned}
              onChange={(e) => setPinned(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            Pin this note
          </label>

          {fieldErrors.pinned && (
            <p className="text-xs text-rose-600">{fieldErrors.pinned}</p>
          )}
        </div>

        <div className="mt-6 flex gap-2">
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {busy ? "Saving…" : editing ? "Save changes" : "Create note"}
          </button>
          <button
            type="button"
            onClick={() => navigate(editing ? `/notes/${noteId}` : "/")}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

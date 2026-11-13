import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { TagInput } from "../components/TagInput";
import { ApiError, createNote, getNote, updateNote } from "../lib/api";

type Mode = "create" | "edit";

export function NoteEditorPage({ mode }: { mode: Mode }) {
  const { id } = useParams();
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [pinned, setPinned] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(mode === "edit");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (mode !== "edit" || !id) return;
    let alive = true;
    setLoading(true);
    getNote(Number(id))
      .then((note) => {
        if (!alive) return;
        setTitle(note.title);
        setContent(note.content);
        setTags(note.tags);
        setPinned(note.pinned);
      })
      .catch((err: Error) => {
        if (alive) setError(err.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [mode, id]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      if (mode === "create") {
        const note = await createNote({ title, content, tags, pinned });
        navigate(`/notes/${note.id}`);
      } else {
        await updateNote(Number(id), { title, content, tags, pinned });
        navigate(`/notes/${id}`);
      }
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Something went wrong. Please try again.",
      );
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10">
        <p className="text-sm text-slate-500">Loading note…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <Link to="/" className="text-sm text-indigo-700 hover:underline">
        ← Back to all notes
      </Link>

      <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">
        {mode === "create" ? "New note" : "Edit note"}
      </h1>

      <form onSubmit={handleSubmit} className="mt-6 space-y-5">
        {error ? (
          <div
            role="alert"
            className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
          >
            {error}
          </div>
        ) : null}

        <div>
          <label
            htmlFor="title"
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Title
          </label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="What's this note about?"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          />
        </div>

        <div>
          <label
            htmlFor="content"
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Content
          </label>
          <textarea
            id="content"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            rows={12}
            placeholder="Write your note…"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm leading-relaxed text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          />
        </div>

        <div>
          <label htmlFor="tags" className="mb-1 block text-sm font-medium text-slate-700">
            Tags
          </label>
          <TagInput id="tags" tags={tags} onChange={setTags} />
        </div>

        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={pinned}
            onChange={(event) => setPinned(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          Pin this note
        </label>

        <div className="flex items-center gap-3 border-t border-slate-100 pt-5">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-60"
          >
            {saving ? "Saving…" : mode === "create" ? "Create note" : "Save changes"}
          </button>
          <Link
            to={mode === "edit" && id ? `/notes/${id}` : "/"}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

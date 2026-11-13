import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  createNote,
  updateNote,
  getNote,
  ApiError,
} from "../api";
import { useAuth } from "../auth";

export function NoteForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { username } = useAuth();
  const isEdit = Boolean(id);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [pinned, setPinned] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(isEdit);

  useEffect(() => {
    if (!isEdit) return;
    let alive = true;
    getNote(Number(id))
      .then((n) => {
        if (!alive) return;
        if (username !== n.author) {
          navigate(`/notes/${n.id}`, { replace: true });
          return;
        }
        setTitle(n.title);
        setContent(n.content);
        setTagsInput(n.tags.join(", "));
        setPinned(n.pinned);
      })
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [id, isEdit, username, navigate]);

  function parseTags(): string[] {
    return tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const input = {
        title,
        content,
        tags: parseTags(),
        pinned,
      };
      if (isEdit) {
        const n = await updateNote(Number(id), input);
        navigate(`/notes/${n.id}`);
      } else {
        const n = await createNote(input);
        navigate(`/notes/${n.id}`);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <p className="text-slate-500">Loading…</p>;
  }

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">
        {isEdit ? "Edit note" : "New note"}
      </h1>
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Content</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={8}
            className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">
            Tags (comma-separated)
          </label>
          <input
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="work, ideas"
            className="w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={pinned}
            onChange={(e) => setPinned(e.target.checked)}
          />
          <span className="text-sm">Pin this note</span>
        </label>
        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {busy ? "Saving…" : isEdit ? "Save changes" : "Create note"}
          </button>
          <Link
            to={isEdit ? `/notes/${id}` : "/"}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

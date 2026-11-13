import { useEffect, useState, type FormEvent } from "react";
import { ApiError, api, type NoteInput } from "../api";
import { useAuth } from "../auth";
import TagInput from "../components/TagInput";
import { Alert, FieldError, btnPrimary, btnSecondary, inputCls } from "../components/ui";
import { Link, navigate } from "../router";

const EMPTY: NoteInput = { title: "", content: "", tags: [], pinned: false };
const KNOWN_FIELDS = ["title", "content", "tags", "pinned"];

export default function NoteForm({ id }: { id?: number }) {
  const { username } = useAuth();
  const [form, setForm] = useState<NoteInput>(EMPTY);
  const [loaded, setLoaded] = useState(id === undefined);
  const [author, setAuthor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  useEffect(() => {
    api
      .tags()
      .then((r) => setSuggestions(r.items.map((t) => t.tag)))
      .catch(() => setSuggestions([]));
  }, []);

  useEffect(() => {
    if (id === undefined) return;
    let cancelled = false;
    api
      .getNote(id)
      .then((n) => {
        if (cancelled) return;
        setForm({ title: n.title, content: n.content, tags: n.tags, pinned: n.pinned });
        setAuthor(n.author);
        setLoaded(true);
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!username) {
    return (
      <Alert tone="info">
        Please{" "}
        <Link to="/login" className="font-semibold underline">
          sign in
        </Link>{" "}
        to {id === undefined ? "write notes" : "edit notes"}.
      </Alert>
    );
  }
  if (!loaded) return error ? <Alert>{error}</Alert> : <p className="text-slate-500">Loading…</p>;
  if (id !== undefined && author && author.toLowerCase() !== username.toLowerCase()) {
    return <Alert>Only the author may edit this note.</Alert>;
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setFieldErrors({});
    try {
      const note = id === undefined ? await api.createNote(form) : await api.updateNote(id, form);
      navigate(`/notes/${note.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setFieldErrors(err.errors);
        setError(err.message);
      } else {
        setError((err as Error).message);
      }
      setSaving(false);
    }
  };

  const otherErrors = Object.entries(fieldErrors).filter(([k]) => !KNOWN_FIELDS.includes(k));

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-4 text-2xl font-bold text-slate-900">{id === undefined ? "New note" : "Edit note"}</h1>
      <form
        onSubmit={onSubmit}
        noValidate
        className="space-y-5 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
      >
        {error && <Alert>{error}</Alert>}
        {otherErrors.map(([k, v]) => (
          <Alert key={k}>{v}</Alert>
        ))}
        <div>
          <label htmlFor="note-title" className="mb-1 block text-sm font-medium text-slate-700">
            Title
          </label>
          <input
            id="note-title"
            className={`${inputCls} ${fieldErrors.title ? "border-red-400" : ""}`}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            aria-invalid={!!fieldErrors.title || undefined}
            aria-describedby={fieldErrors.title ? "note-title-error" : undefined}
            autoFocus
          />
          <FieldError id="note-title-error" message={fieldErrors.title} />
        </div>
        <div>
          <label htmlFor="note-content" className="mb-1 block text-sm font-medium text-slate-700">
            Content
          </label>
          <textarea
            id="note-content"
            rows={10}
            className={`${inputCls} ${fieldErrors.content ? "border-red-400" : ""}`}
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
            aria-invalid={!!fieldErrors.content || undefined}
            aria-describedby={fieldErrors.content ? "note-content-error" : undefined}
          />
          <FieldError id="note-content-error" message={fieldErrors.content} />
        </div>
        <div>
          <label htmlFor="note-tags" className="mb-1 block text-sm font-medium text-slate-700">
            Tags
          </label>
          <TagInput
            id="note-tags"
            value={form.tags}
            onChange={(tags) => setForm((f) => ({ ...f, tags }))}
            suggestions={suggestions}
            invalid={!!fieldErrors.tags}
            describedBy={fieldErrors.tags ? "note-tags-error" : undefined}
          />
          <FieldError id="note-tags-error" message={fieldErrors.tags} />
        </div>
        <div>
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 accent-indigo-600"
              checked={form.pinned}
              onChange={(e) => setForm({ ...form, pinned: e.target.checked })}
            />
            Pin this note
          </label>
          <FieldError message={fieldErrors.pinned} />
        </div>
        <div className="flex gap-2">
          <button type="submit" className={btnPrimary} disabled={saving}>
            {saving ? "Saving…" : id === undefined ? "Create note" : "Save changes"}
          </button>
          <Link to={id === undefined ? "/" : `/notes/${id}`} className={btnSecondary}>
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

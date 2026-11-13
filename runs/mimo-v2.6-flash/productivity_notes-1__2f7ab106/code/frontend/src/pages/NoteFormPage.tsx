import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import { api, ApiError, type Note, type NoteDraft } from "../api";
import { ErrorAlert, Spinner, TagChip } from "../components/ui";

type Props = {
  noteId: number | null;
  onCancel: () => void;
  onSaved: (note: Note) => void;
};

const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

export default function NoteFormPage({ noteId, onCancel, onSaved }: Props) {
  const editing = noteId !== null;
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [pinned, setPinned] = useState(false);
  const [tagText, setTagText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (noteId === null) return;
    let cancelled = false;
    setLoading(true);
    api
      .getNote(noteId)
      .then((note) => {
        if (cancelled) return;
        setTitle(note.title);
        setContent(note.content);
        setTags(note.tags);
        setPinned(note.pinned);
        setError(null);
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

  function commitTagText() {
    const parts = tagText
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length === 0) {
      setTagText("");
      return;
    }
    setTags((current) => {
      const seen = new Set(current.map((t) => t.toLowerCase()));
      const next = [...current];
      for (const part of parts) {
        const key = part.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        next.push(part);
      }
      return next;
    });
    setTagText("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      commitTagText();
    } else if (event.key === "Backspace" && tagText === "" && tags.length > 0) {
      setTags((current) => current.slice(0, -1));
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    commitTagText();
    setSaving(true);
    setError(null);
    const draft: NoteDraft = {
      title: title.trim(),
      content,
      tags: tagText ? [...tags, ...tagText.split(",").map((t) => t.trim()).filter(Boolean)] : tags,
      pinned,
    };
    try {
      const saved = noteId === null ? await api.createNote(draft) : await api.updateNote(noteId, draft);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save the note.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <Spinner label="Loading note…" />;
  }

  return (
    <div className="mx-auto max-w-3xl">
      <button
        type="button"
        onClick={onCancel}
        className="mb-4 text-sm font-medium text-indigo-600 hover:underline"
      >
        ← Cancel
      </button>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="mb-5 text-xl font-bold text-slate-900">
          {editing ? "Edit note" : "New note"}
        </h1>

        <form onSubmit={submit} className="space-y-5">
          <div>
            <label htmlFor="title" className="mb-1 block text-sm font-medium text-slate-700">
              Title
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Note title"
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="content" className="mb-1 block text-sm font-medium text-slate-700">
              Content
            </label>
            <textarea
              id="content"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              rows={12}
              placeholder="Write your note…"
              className={`${inputClass} resize-y font-mono text-sm leading-6`}
            />
            <p className="mt-1 text-xs text-slate-500">Plain text — line breaks are kept.</p>
          </div>

          <div>
            <label htmlFor="tags" className="mb-1 block text-sm font-medium text-slate-700">
              Tags
            </label>
            <div className="rounded-md border border-slate-300 bg-white p-2 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-200">
              <div className="mb-2 flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <TagChip
                    key={tag}
                    onClick={() => setTags((current) => current.filter((t) => t !== tag))}
                  >
                    {tag} ×
                  </TagChip>
                ))}
              </div>
              <input
                id="tags"
                type="text"
                value={tagText}
                onChange={(event) => setTagText(event.target.value)}
                onKeyDown={onKeyDown}
                onBlur={commitTagText}
                placeholder={tags.length === 0 ? "Add tags, comma separated" : "Add another tag…"}
                className="w-full border-0 bg-transparent px-1 py-1 text-sm text-slate-900 outline-none placeholder:text-slate-400"
              />
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Press Enter or comma to add a tag; click a tag to remove it.
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={pinned}
              onChange={(event) => setPinned(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 accent-indigo-600"
            />
            Pin this note
          </label>

          <ErrorAlert message={error} />

          <div className="flex gap-3 border-t border-slate-200 pt-4">
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {saving ? "Saving…" : editing ? "Save changes" : "Create note"}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { ApiError, api } from "./api";
import type { Note } from "./api";
import { useAuth } from "./auth";
import { btn, btnGhost, card, chip, input, label } from "./ui";

export default function NoteForm() {
  const { id } = useParams();
  const editing = id !== undefined;
  const { username } = useAuth();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagText, setTagText] = useState("");
  const [pinned, setPinned] = useState(false);
  const [loading, setLoading] = useState(editing);
  const [author, setAuthor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!editing) return;
    api<Note>(`/notes/${id}`)
      .then((n) => {
        setTitle(n.title);
        setContent(n.content);
        setTags(n.tags);
        setPinned(n.pinned);
        setAuthor(n.author);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id, editing]);

  if (!username) return <Navigate to="/login" replace />;
  if (loading) return <p className="text-slate-500">Loading…</p>;
  if (editing && author && author !== username)
    return (
      <p role="alert" className="rounded bg-red-50 p-2 text-red-700">
        Only the author may edit this note.
      </p>
    );
  if (editing && !author)
    return (
      <p role="alert" className="rounded bg-red-50 p-2 text-red-700">
        {error || "Note not found"}
      </p>
    );

  function addTags(raw: string) {
    const parts = raw
      .split(/[,\s]+/)
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    if (parts.length === 0) return;
    setTags((cur) => [...cur, ...parts.filter((p, i) => !cur.includes(p) && parts.indexOf(p) === i)]);
    setTagText("");
  }

  function onTagKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTags(tagText);
    } else if (e.key === "Backspace" && !tagText && tags.length) {
      setTags(tags.slice(0, -1));
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setFields({});
    const pending = tagText
      .split(/[,\s]+/)
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    const allTags = [...tags, ...pending.filter((p) => !tags.includes(p))];
    try {
      const saved = await api<Note>(editing ? `/notes/${id}` : "/notes", {
        method: editing ? "PATCH" : "POST",
        body: { title, content, tags: allTags, pinned },
      });
      navigate(`/notes/${saved.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFields(err.fields);
        if (err.status === 401) navigate("/login");
      } else setError("Something went wrong");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className={`${card} space-y-4`}>
      <h1 className="text-xl font-semibold">{editing ? "Edit note" : "New note"}</h1>
      {error && (
        <p role="alert" className="rounded bg-red-50 p-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <div>
        <label htmlFor="title" className={label}>
          Title
        </label>
        <input
          id="title"
          className={input}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        {fields.title && <p className="mt-1 text-sm text-red-600">{fields.title}</p>}
      </div>
      <div>
        <label htmlFor="content" className={label}>
          Content
        </label>
        <textarea
          id="content"
          rows={10}
          className={input}
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        {fields.content && <p className="mt-1 text-sm text-red-600">{fields.content}</p>}
      </div>
      <div>
        <label htmlFor="tags" className={label}>
          Tags
        </label>
        <div className="flex flex-wrap gap-2 rounded border border-slate-300 bg-white p-2">
          {tags.map((t) => (
            <span key={t} className={chip}>
              {t}
              <button
                type="button"
                aria-label={`Remove tag ${t}`}
                className="ml-1 text-indigo-400 hover:text-indigo-800"
                onClick={() => setTags(tags.filter((x) => x !== t))}
              >
                ×
              </button>
            </span>
          ))}
          <input
            id="tags"
            className="min-w-32 flex-1 text-sm outline-none"
            placeholder="Type a tag, press Enter"
            value={tagText}
            onChange={(e) => setTagText(e.target.value)}
            onKeyDown={onTagKey}
            onBlur={() => addTags(tagText)}
          />
        </div>
        {fields.tags && <p className="mt-1 text-sm text-red-600">{fields.tags}</p>}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
        Pin this note
      </label>
      {fields.pinned && <p className="text-sm text-red-600">{fields.pinned}</p>}
      <div className="flex gap-2">
        <button className={btn} disabled={busy}>
          {editing ? "Save" : "Create"}
        </button>
        <button type="button" className={btnGhost} onClick={() => navigate(-1)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

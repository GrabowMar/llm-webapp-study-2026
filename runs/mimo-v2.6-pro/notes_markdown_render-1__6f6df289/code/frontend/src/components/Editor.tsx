import { useEffect, useRef, useState } from "react";
import { ApiError, deleteNote, fetchNoteHtml, updateNote } from "../api";
import type { Note } from "../types";

interface Props {
  note: Note;
  onSaved: (note: Note) => void;
  onDeleted: () => void;
  onSignOut: () => void;
}

export default function Editor({ note, onSaved, onDeleted, onSignOut }: Props) {
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [published, setPublished] = useState(note.published);
  const [html, setHtml] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const savedRef = useRef({ title: note.title, body: note.body });
  const handlersRef = useRef({ onSaved, onDeleted, onSignOut });
  handlersRef.current = { onSaved, onDeleted, onSignOut };

  const publicLink = `${window.location.origin}/p/${note.id}`;
  const dirty = title !== savedRef.current.title || body !== savedRef.current.body;
  const pendingRef = useRef({ id: note.id, title, body, dirty: false });
  pendingRef.current = { id: note.id, title, body, dirty };

  function reportError(err: unknown) {
    if (err instanceof ApiError && err.status === 401) {
      handlersRef.current.onSignOut();
      return;
    }
    setError(err instanceof Error ? err.message : "Something went wrong");
  }

  useEffect(() => {
    let cancelled = false;
    fetchNoteHtml(note.id)
      .then((value) => {
        if (!cancelled) setHtml(value);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [note.id]);

  useEffect(() => {
    if (title === savedRef.current.title && body === savedRef.current.body) return;
    const timer = setTimeout(async () => {
      setSaving(true);
      setError(null);
      try {
        const saved = await updateNote(note.id, { title, body });
        savedRef.current = { title: saved.title, body: saved.body };
        handlersRef.current.onSaved(saved);
        setHtml(await fetchNoteHtml(note.id));
      } catch (err) {
        reportError(err);
      } finally {
        setSaving(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [title, body, note.id]);

  useEffect(() => {
    return () => {
      const pending = pendingRef.current;
      if (pending.dirty) {
        updateNote(pending.id, { title: pending.title, body: pending.body }).catch(
          () => {},
        );
      }
    };
  }, []);

  async function togglePublished() {
    const next = !published;
    setPublished(next);
    setError(null);
    try {
      const saved = await updateNote(note.id, { published: next });
      handlersRef.current.onSaved(saved);
    } catch (err) {
      setPublished(!next);
      reportError(err);
    }
  }

  function copyWithFallback(text: string): boolean {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    document.body.removeChild(textarea);
    return ok;
  }

  async function copyPublicLink() {
    let ok = false;
    try {
      await navigator.clipboard.writeText(publicLink);
      ok = true;
    } catch {
      ok = copyWithFallback(publicLink);
    }
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } else {
      setError("Could not copy the link — select and copy it manually");
    }
  }

  async function handleDelete() {
    if (!window.confirm("Delete this note? This cannot be undone.")) return;
    setError(null);
    try {
      await deleteNote(note.id);
      handlersRef.current.onDeleted();
    } catch (err) {
      reportError(err);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Untitled note"
        aria-label="Note title"
        className="w-full rounded-lg border border-transparent px-2 py-1 text-2xl font-semibold text-slate-900 outline-none placeholder:text-slate-400 hover:border-slate-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
      />

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            role="switch"
            aria-checked={published}
            aria-label="Published"
            onClick={togglePublished}
            className={`relative h-6 w-11 rounded-full transition-colors ${
              published ? "bg-indigo-600" : "bg-slate-300"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                published ? "translate-x-5" : ""
              }`}
            />
          </button>
          <span className="text-sm font-medium text-slate-700">Published</span>
        </div>

        <span className="text-xs text-slate-500">
          {saving ? "Saving…" : dirty ? "Unsaved changes" : "All changes saved"}
        </span>

        <button
          type="button"
          onClick={handleDelete}
          className="ml-auto rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700"
        >
          Delete
        </button>
      </div>

      {published && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
          <span className="text-xs font-medium text-slate-600">Public link</span>
          <input
            readOnly
            value={publicLink}
            onFocus={(event) => event.target.select()}
            aria-label="Public link"
            className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
          />
          <button
            type="button"
            onClick={copyPublicLink}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500"
          >
            {copied ? "Copied!" : "Copy link"}
          </button>
          <a
            href={publicLink}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-medium text-indigo-600 hover:underline"
          >
            Open
          </a>
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col">
          <label
            htmlFor="note-body"
            className="mb-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase"
          >
            Markdown
          </label>
          <textarea
            id="note-body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Write your note in Markdown…"
            spellCheck={false}
            className="min-h-80 w-full flex-1 resize-y rounded-xl border border-slate-300 p-3 font-mono text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
        </div>
        <div className="flex flex-col">
          <span className="mb-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            Preview
          </span>
          <div className="min-h-80 flex-1 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div
              className="prose prose-slate max-w-none"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

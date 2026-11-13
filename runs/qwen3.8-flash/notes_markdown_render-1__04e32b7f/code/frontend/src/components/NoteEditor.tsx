import { useEffect, useRef, useState } from "react";
import { api, publicUrl } from "../api";
import type { Note } from "../types";

interface Draft {
  title: string;
  body: string;
  published: boolean;
}

const EMPTY: Draft = { title: "", body: "", published: false };

export default function NoteEditor({
  note,
  onChange,
  onDelete,
}: {
  note: Note | null;
  onChange: (note: Note) => void;
  onDelete: (id: number) => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [published, setPublished] = useState(false);
  const [preview, setPreview] = useState("");
  const [saving, setSaving] = useState<"idle" | "saving" | "saved">("idle");
  const [copied, setCopied] = useState(false);
  const [savedId, setSavedId] = useState<number | null>(note?.id ?? null);

  const noteIdRef = useRef<number | null>(note?.id ?? null);
  const draftRef = useRef<Draft>({ ...EMPTY });
  const previewTimer = useRef<number | null>(null);
  const saveTimer = useRef<number | null>(null);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    const id = note?.id ?? null;
    // ignore the update caused by our own save
    if (id !== null && id === noteIdRef.current) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    noteIdRef.current = id;
    setSavedId(id);
    const next: Draft = note
      ? { title: note.title, body: note.body, published: note.published }
      : { ...EMPTY };
    draftRef.current = next;
    setTitle(next.title);
    setBody(next.body);
    setPublished(next.published);
    if (note) refreshPreview(note.body);
    else setPreview("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.id]);

  useEffect(() => {
    return () => {
      if (previewTimer.current) window.clearTimeout(previewTimer.current);
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, []);

  function refreshPreview(text: string) {
    if (previewTimer.current) window.clearTimeout(previewTimer.current);
    previewTimer.current = window.setTimeout(async () => {
      try {
        setPreview(await api.renderHtml(text));
      } catch {
        /* keep the previous preview on error */
      }
    }, 250);
  }

  async function actuallySave() {
    const id = noteIdRef.current;
    const draft: Draft = { ...draftRef.current };
    // an empty new note is never sent to the API
    if (id === null && !draft.title && !draft.body) return;
    setSaving("saving");
    try {
      const saved =
        id === null
          ? await api.createNote(draft)
          : await api.updateNote(id, draft);
      noteIdRef.current = saved.id;
      setSavedId(saved.id);
      onChange(saved);
      const current: Draft = draftRef.current;
      if (
        current.title !== draft.title ||
        current.body !== draft.body ||
        current.published !== draft.published
      ) {
        return actuallySave();
      }
      setSaving("saved");
    } catch {
      setSaving("idle");
    }
  }

  function saveNow() {
    saveQueue.current = saveQueue.current
      .then(() => actuallySave())
      .catch(() => {});
  }

  function scheduleSave() {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(saveNow, 500);
  }

  function editTitle(value: string) {
    draftRef.current = { ...draftRef.current, title: value };
    setTitle(value);
    scheduleSave();
  }

  function editBody(value: string) {
    draftRef.current = { ...draftRef.current, body: value };
    setBody(value);
    refreshPreview(value);
    scheduleSave();
  }

  function togglePublished() {
    const value = !published;
    setPublished(value);
    draftRef.current = { ...draftRef.current, published: value };
    saveNow();
  }

  async function copyLink() {
    if (savedId === null) return;
    try {
      await navigator.clipboard.writeText(publicUrl(savedId));
    } catch {
      /* clipboard unavailable; still show feedback */
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  const link = savedId !== null && published ? publicUrl(savedId) : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3">
        <input
          value={title}
          onChange={(e) => editTitle(e.target.value)}
          placeholder="Untitled"
          className="min-w-40 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-lg font-semibold text-slate-900 outline-none hover:border-slate-200 focus:border-indigo-400"
        />
        <span className="text-xs text-slate-400">
          {saving === "saving" ? "Saving…" : saving === "saved" ? "Saved" : ""}
        </span>
        <span className="flex items-center gap-2 text-sm text-slate-600">
          <span>Published</span>
          <button
            type="button"
            role="switch"
            aria-checked={published}
            onClick={togglePublished}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
              published ? "bg-emerald-500" : "bg-slate-300"
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                published ? "translate-x-[22px]" : "translate-x-[2px]"
              }`}
            />
          </button>
        </span>
        <button
          onClick={() => {
            if (savedId !== null) onDelete(savedId);
          }}
          disabled={savedId === null}
          className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Delete
        </button>
      </div>

      {link && (
        <div className="flex items-center gap-2 border-b border-slate-200 bg-emerald-50 px-4 py-2 text-sm">
          <span className="shrink-0 font-medium text-emerald-800">Public link:</span>
          <code className="flex-1 truncate rounded bg-white px-2 py-1 text-xs text-emerald-900">
            {link}
          </code>
          <button
            onClick={() => void copyLink()}
            className="shrink-0 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 text-xs font-semibold text-emerald-700 hover:underline"
          >
            Open
          </a>
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2 lg:divide-x lg:divide-slate-200">
        <textarea
          value={body}
          onChange={(e) => editBody(e.target.value)}
          placeholder="# Start writing in Markdown…"
          spellCheck={false}
          className="min-h-56 w-full resize-none bg-white p-4 font-mono text-sm text-slate-800 outline-none"
        />
        <div className="min-h-56 overflow-y-auto bg-slate-50 p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Preview
          </div>
          {preview ? (
            <article
              className="prose prose-sm max-w-none text-slate-800"
              dangerouslySetInnerHTML={{ __html: preview }}
            />
          ) : (
            <p className="text-sm text-slate-400">Nothing to preview yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

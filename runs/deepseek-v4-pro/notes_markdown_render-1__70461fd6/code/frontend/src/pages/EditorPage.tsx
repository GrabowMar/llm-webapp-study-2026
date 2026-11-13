import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { deleteNote, getNote, renderNote, updateNote, type Note } from "../api";

let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const noteId = Number(id);
  const navigate = useNavigate();
  const [note, setNote] = useState<Note | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [published, setPublished] = useState(false);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!loadedRef.current) {
      loadedRef.current = true;
      getNote(noteId)
        .then((n) => {
          setNote(n);
          setTitle(n.title);
          setBody(n.body);
          setPublished(n.published);
        })
        .catch((err) =>
          setError(err instanceof Error ? err.message : "Failed to load note"),
        );
    }
    return () => {
      loadedRef.current = false;
    };
  }, [noteId]);

  const refreshPreview = useCallback(async () => {
    try {
      const html = await renderNote(noteId);
      setPreview(html);
    } catch {
      /* ignore */
    }
  }, [noteId]);

  useEffect(() => {
    refreshPreview();
  }, [refreshPreview]);

  const persist = useCallback(
    (patch: Partial<Pick<Note, "title" | "body" | "published">>) => {
      setSaving(true);
      updateNote(noteId, patch)
        .then((updated) => {
          setNote(updated);
          setSaving(false);
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : "Failed to save");
          setSaving(false);
        });
    },
    [noteId],
  );

  const onBodyChange = (value: string) => {
    setBody(value);
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      persist({ body: value });
      refreshPreview();
    }, 500);
  };

  const onTitleChange = (value: string) => {
    setTitle(value);
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => persist({ title: value }), 500);
  };

  const togglePublished = () => {
    const next = !published;
    setPublished(next);
    persist({ published: next });
  };

  const publicUrl = `${window.location.origin}/public/${noteId}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  const onDelete = async () => {
    if (!confirm("Delete this note? This cannot be undone.")) return;
    setDeleting(true);
    try {
      await deleteNote(noteId);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
      setDeleting(false);
    }
  };

  if (error && !note) {
    return (
      <div>
        <p className="text-red-600 mb-4">{error}</p>
        <Link to="/" className="text-blue-600 hover:underline text-sm">
          Back to notes
        </Link>
      </div>
    );
  }

  if (!note) {
    return <p className="text-slate-500">Loading…</p>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <Link
          to="/"
          className="text-sm text-slate-500 hover:text-slate-800 flex items-center gap-1"
        >
          ← All notes
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">{saving ? "Saving…" : "Saved"}</span>
          <button
            onClick={onDelete}
            disabled={deleting}
            className="text-sm text-red-600 hover:text-red-800 border border-red-200 rounded-lg px-3 py-1"
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      <input
        className="w-full text-2xl font-bold text-slate-900 bg-transparent border-none focus:outline-none mb-1"
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        placeholder="Untitled"
      />

      <div className="flex items-center gap-4 mb-4">
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={published}
            onChange={togglePublished}
            className="h-4 w-4 rounded border-slate-300 text-blue-600"
          />
          <span className="text-sm text-slate-700">Published</span>
        </label>
        {published && (
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={publicUrl}
              onFocus={(e) => e.target.select()}
              className="text-xs text-slate-600 bg-slate-100 border border-slate-200 rounded-lg px-2 py-1 w-72"
            />
            <button
              onClick={copyLink}
              className="text-xs text-blue-600 hover:underline"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
            <a
              href={publicUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-blue-600 hover:underline"
            >
              Open
            </a>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <textarea
          className="w-full h-[60vh] rounded-xl border border-slate-200 bg-white p-4 font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={body}
          onChange={(e) => onBodyChange(e.target.value)}
          placeholder="Write Markdown here…"
        />
        <div className="h-[60vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-4">
          <div
            className="markdown-body"
            dangerouslySetInnerHTML={{ __html: preview }}
          />
        </div>
      </div>
    </div>
  );
}

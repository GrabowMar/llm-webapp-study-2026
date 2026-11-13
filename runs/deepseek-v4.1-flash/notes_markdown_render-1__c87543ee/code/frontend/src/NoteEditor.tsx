import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, type Note } from "./api";
import { Badge, ErrorBanner, Spinner, formatDate } from "./components";

export default function NoteEditor() {
  const { id } = useParams();
  const noteId = Number(id);
  const navigate = useNavigate();

  const [note, setNote] = useState<Note | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [published, setPublished] = useState(false);
  const [preview, setPreview] = useState("");
  const [previewError, setPreviewError] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  const savedRef = useRef({ title: "", body: "", published: false });
  const saveSeq = useRef(0);
  const renderSeq = useRef(0);
  const copyTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .getNote(noteId)
      .then((loaded) => {
        if (cancelled) return;
        setNote(loaded);
        setTitle(loaded.title);
        setBody(loaded.body);
        setPublished(loaded.published);
        savedRef.current = {
          title: loaded.title,
          body: loaded.body,
          published: loaded.published,
        };
      })
      .catch((err) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Could not load note");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [noteId]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const seq = ++renderSeq.current;
      try {
        const html = await api.renderMarkdown(body);
        if (!cancelled && seq === renderSeq.current) {
          setPreview(html);
          setPreviewError("");
        }
      } catch (err) {
        if (!cancelled && seq === renderSeq.current) {
          setPreviewError(
            err instanceof Error ? err.message : "Could not render preview",
          );
        }
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [body]);

  useEffect(() => {
    if (!note) return;
    const saved = savedRef.current;
    if (
      title === saved.title &&
      body === saved.body &&
      published === saved.published
    ) {
      return;
    }
    const timer = window.setTimeout(async () => {
      const seq = ++saveSeq.current;
      setStatus("saving");
      setError("");
      try {
        const updated = await api.updateNote(note.id, {
          title,
          body,
          published,
        });
        if (seq !== saveSeq.current) return;
        savedRef.current = {
          title: updated.title,
          body: updated.body,
          published: updated.published,
        };
        setNote(updated);
        setStatus("saved");
      } catch (err) {
        if (seq !== saveSeq.current) return;
        setStatus("idle");
        setError(err instanceof Error ? err.message : "Could not save note");
      }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [note, title, body, published]);

  useEffect(() => {
    return () => {
      if (copyTimer.current) window.clearTimeout(copyTimer.current);
    };
  }, []);

  async function onDelete() {
    if (!note) return;
    if (!window.confirm("Delete this note? This cannot be undone.")) return;
    try {
      await api.deleteNote(note.id);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete note");
    }
  }

  async function copyLink() {
    if (!note) return;
    const link = `${window.location.origin}/p/${note.id}`;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // fall back to selecting the input
    }
    setCopied(true);
    if (copyTimer.current) window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopied(false), 1800);
  }

  if (loading) return <Spinner label="Loading note…" />;

  if (!note) {
    return (
      <div className="space-y-4">
        <ErrorBanner>{error || "Note not found"}</ErrorBanner>
        <button
          type="button"
          onClick={() => navigate("/")}
          className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
        >
          ← Back to notes
        </button>
      </div>
    );
  }

  const publicLink = `${window.location.origin}/p/${note.id}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
        >
          ← All notes
        </button>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">
            {status === "saving" ? "Saving…" : status === "saved" ? "All changes saved" : ""}
          </span>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      </div>

      <ErrorBanner>{error}</ErrorBanner>

      <div className="space-y-3">
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Note title"
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-xl font-semibold text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <Badge published={published} />
            <span>Updated {formatDate(note.updated_at)}</span>
          </div>
          <label className="flex cursor-pointer items-center gap-3 text-sm font-medium text-slate-700">
            <span>Published</span>
            <span className="relative inline-flex">
              <input
                type="checkbox"
                checked={published}
                onChange={(event) => setPublished(event.target.checked)}
                className="peer sr-only"
              />
              <span className="h-6 w-11 rounded-full bg-slate-300 transition peer-checked:bg-emerald-500 peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-300" />
              <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
            </span>
          </label>
        </div>

        {published && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
              Public link
            </span>
            <input
              readOnly
              value={publicLink}
              onFocus={(event) => event.currentTarget.select()}
              className="min-w-0 flex-1 rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-sm text-slate-700 outline-none"
            />
            <button
              type="button"
              onClick={copyLink}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
            <a
              href={publicLink}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium text-emerald-700 hover:text-emerald-800"
            >
              Open ↗
            </a>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Markdown
          </div>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            spellCheck={false}
            placeholder="# Start writing…"
            className="min-h-[28rem] w-full flex-1 resize-y rounded-b-2xl px-4 py-3 font-mono text-sm text-slate-800 outline-none"
          />
        </div>
        <div className="flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Preview
          </div>
          <div className="min-h-[28rem] flex-1 overflow-auto px-4 py-3">
            {previewError ? (
              <ErrorBanner>{previewError}</ErrorBanner>
            ) : (
              <div
                className="prose prose-slate max-w-none"
                dangerouslySetInnerHTML={{ __html: preview }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

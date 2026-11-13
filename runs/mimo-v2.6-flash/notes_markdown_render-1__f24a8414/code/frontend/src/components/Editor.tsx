import { ApiError, Note, NoteMeta, api, fetchText, formatDate } from "../api";
import { useEffect, useRef, useState } from "react";

type Props = {
  noteId: number;
  onUpdated: (note: NoteMeta) => void;
  onDeleted: (id: number) => void;
  onUnauthorized: () => void;
  onBack: () => void;
};

const AUTOSAVE_MS = 350;

export default function Editor({ noteId, onUpdated, onDeleted, onUnauthorized, onBack }: Props) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [published, setPublished] = useState(false);
  const [author, setAuthor] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");
  const [previewHtml, setPreviewHtml] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [saveState, setSaveState] = useState<"idle" | "pending" | "saving" | "saved" | "error">(
    "idle",
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const [publishBusy, setPublishBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<"edit" | "preview">("edit");

  const stateRef = useRef({ title: "", body: "", published: false });
  const dirtyRef = useRef(false);
  const inFlightRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const deletedRef = useRef(false);
  const linkRef = useRef<HTMLInputElement>(null);

  const publicUrl = `${window.location.origin}/notes/${noteId}`;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const note = await api<Note>(`/api/notes/${noteId}`);
        if (cancelled) return;
        setTitle(note.title);
        setBody(note.body);
        setPublished(note.published);
        setAuthor(note.author);
        setUpdatedAt(note.updated_at);
        stateRef.current = { title: note.title, body: note.body, published: note.published };
        dirtyRef.current = false;
        setSaveState("idle");
        const html = await fetchText(`/api/notes/${noteId}/html`);
        if (cancelled) return;
        setPreviewHtml(html);
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 401) {
          onUnauthorized();
          return;
        }
        setLoadError(e instanceof Error ? e.message : "Could not load note.");
        setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [noteId, reloadKey, onUnauthorized]);

  function scheduleFlush() {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void flushSave();
    }, AUTOSAVE_MS);
  }

  const flushSave = async () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (inFlightRef.current || !dirtyRef.current || deletedRef.current) {
      return;
    }
    const snapshot = { ...stateRef.current };
    dirtyRef.current = false;
    inFlightRef.current = true;
    setSaveState("saving");
    setSaveError(null);
    let saved = false;
    try {
      const note = await api<Note>(`/api/notes/${noteId}`, {
        method: "PATCH",
        body: { title: snapshot.title, body: snapshot.body },
      });
      saved = true;
      if (deletedRef.current) return;
      setUpdatedAt(note.updated_at);
      onUpdated(note);
      const html = await fetchText(`/api/notes/${noteId}/html`);
      if (deletedRef.current) return;
      setPreviewHtml(html);
      setSaveState("saved");
    } catch (e) {
      if (deletedRef.current) return;
      if (e instanceof ApiError && e.status === 401) {
        onUnauthorized();
        return;
      }
      dirtyRef.current = true;
      setSaveState("error");
      setSaveError(e instanceof Error ? e.message : "Could not save changes.");
    } finally {
      inFlightRef.current = false;
      if (saved && dirtyRef.current && !deletedRef.current) {
        scheduleFlush();
      }
    }
  };

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
      void flushSave();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function markDirty() {
    dirtyRef.current = true;
    setSaveState("pending");
    scheduleFlush();
  }

  function changeTitle(value: string) {
    setTitle(value);
    stateRef.current = { ...stateRef.current, title: value };
    markDirty();
  }

  function changeBody(value: string) {
    setBody(value);
    stateRef.current = { ...stateRef.current, body: value };
    markDirty();
  }

  async function togglePublished() {
    setPublishBusy(true);
    setSaveError(null);
    try {
      const next = !stateRef.current.published;
      const note = await api<Note>(`/api/notes/${noteId}`, {
        method: "PATCH",
        body: { published: next },
      });
      stateRef.current = { ...stateRef.current, published: note.published };
      setPublished(note.published);
      setUpdatedAt(note.updated_at);
      onUpdated(note);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        onUnauthorized();
        return;
      }
      setSaveState("error");
      setSaveError(e instanceof Error ? e.message : "Could not update visibility.");
    } finally {
      setPublishBusy(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      linkRef.current?.select();
    }
  }

  async function removeNote() {
    if (!window.confirm("Delete this note? This cannot be undone.")) {
      return;
    }
    setDeleteBusy(true);
    deletedRef.current = true;
    try {
      await api(`/api/notes/${noteId}`, { method: "DELETE" });
      onDeleted(noteId);
    } catch (e) {
      deletedRef.current = false;
      setDeleteBusy(false);
      if (e instanceof ApiError && e.status === 401) {
        onUnauthorized();
        return;
      }
      setSaveState("error");
      setSaveError(e instanceof Error ? e.message : "Could not delete note.");
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-white text-sm text-slate-500">
        Loading note…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-white p-8 text-center">
        <p className="text-sm text-red-600">{loadError}</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Retry
          </button>
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            Back to notes
          </button>
        </div>
      </div>
    );
  }

  const statusChip =
    saveState === "saving" ? (
      <span className="text-xs text-slate-500">Saving…</span>
    ) : saveState === "pending" ? (
      <span className="text-xs text-slate-400">Unsaved changes</span>
    ) : saveState === "saved" ? (
      <span className="text-xs text-emerald-600">Saved</span>
    ) : saveState === "error" ? (
      <span className="text-xs font-medium text-red-600" title={saveError ?? ""}>
        Save failed
      </span>
    ) : null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-3 py-3 sm:px-6">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to notes"
          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 sm:hidden"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="h-5 w-5"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <input
          type="text"
          value={title}
          onChange={(e) => changeTitle(e.target.value)}
          placeholder="Untitled note"
          aria-label="Note title"
          className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-lg font-semibold text-slate-900 placeholder:text-slate-400 hover:border-slate-200 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
        />
        <span className="hidden text-xs text-slate-400 md:block">
          {updatedAt ? `Edited ${formatDate(updatedAt)}` : ""}
        </span>
        {statusChip}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void togglePublished()}
            disabled={publishBusy}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-60 ${
              published
                ? "border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {published ? "Published" : "Publish"}
          </button>
          <button
            type="button"
            onClick={() => void removeNote()}
            disabled={deleteBusy}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
          >
            Delete
          </button>
        </div>
      </header>

      {published && (
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-indigo-50/60 px-3 py-2 sm:px-6">
          <span className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
            Public link
          </span>
          <input
            ref={linkRef}
            readOnly
            value={publicUrl}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="Public link"
            className="min-w-0 flex-1 rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs text-slate-700 focus:border-indigo-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void copyLink()}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
          <a
            href={`/notes/${noteId}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Open
          </a>
        </div>
      )}

      <div className="flex gap-1 border-b border-slate-200 px-3 lg:hidden">
        <button
          type="button"
          onClick={() => setTab("edit")}
          className={`px-3 py-2 text-sm font-medium ${
            tab === "edit" ? "border-b-2 border-indigo-600 text-indigo-700" : "text-slate-500"
          }`}
        >
          Write
        </button>
        <button
          type="button"
          onClick={() => setTab("preview")}
          className={`px-3 py-2 text-sm font-medium ${
            tab === "preview" ? "border-b-2 border-indigo-600 text-indigo-700" : "text-slate-500"
          }`}
        >
          Preview
        </button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)] overflow-auto lg:grid-cols-2 lg:overflow-hidden">
        <textarea
          value={body}
          onChange={(e) => changeBody(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "s") {
              e.preventDefault();
              void flushSave();
            }
          }}
          placeholder="Start writing in Markdown… (# headings, **bold**, lists, code)"
          aria-label="Note body"
          className={`h-full w-full resize-none border-0 bg-white p-5 font-mono text-[13px] leading-6 text-slate-800 outline-none placeholder:text-slate-400 sm:p-6 ${
            tab === "edit" ? "" : "hidden"
          } lg:block`}
        />
        <div
          className={`h-full overflow-auto bg-slate-50 p-5 sm:p-6 lg:border-l lg:border-slate-200 ${
            tab === "preview" ? "" : "hidden"
          } lg:block`}
        >
          {previewHtml ? (
            <div
              className="prose prose-slate max-w-none text-sm"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          ) : (
            <p className="text-sm text-slate-400">Nothing to preview yet.</p>
          )}
        </div>
      </div>

      {saveState === "error" && saveError && (
        <div className="border-t border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700 sm:px-6">
          {saveError}
        </div>
      )}
      <div className="hidden border-t border-slate-100 px-6 py-1.5 text-[11px] text-slate-400 sm:block">
        {author ? `Author: ${author} · ` : ""}
        Autosaves as you type · Ctrl/Cmd+S to save now
      </div>
    </div>
  );
}

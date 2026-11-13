import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, formatDate, publicUrl, type Note } from "../api";

type SaveState = "saved" | "dirty" | "saving" | "error";

type Props = {
  id: number;
  onChanged: (note: Note) => void;
  onDeleted: (id: number) => void;
  onMissing: () => void;
};

export default function NoteEditor({ id, onChanged, onDeleted, onMissing }: Props) {
  const [note, setNote] = useState<Note | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [html, setHtml] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<"write" | "preview">("write");

  const pending = useRef<{ title?: string; body?: string }>({});
  const timer = useRef<number | undefined>(undefined);
  const saving = useRef<Promise<void>>(Promise.resolve());
  const previewAbort = useRef<AbortController | null>(null);
  const callbacks = useRef({ onChanged, onDeleted, onMissing });
  callbacks.current = { onChanged, onDeleted, onMissing };

  const refreshPreview = useCallback(async () => {
    previewAbort.current?.abort();
    const ctrl = new AbortController();
    previewAbort.current = ctrl;
    try {
      const h = await api.noteHtml(id, ctrl.signal);
      if (!ctrl.signal.aborted) setHtml(h);
    } catch (err) {
      if ((err as Error).name !== "AbortError") setError("Could not render preview.");
    }
  }, [id]);

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
    const run = async () => {
      const changes = pending.current;
      if (Object.keys(changes).length === 0) return;
      pending.current = {};
      setSaveState("saving");
      try {
        const updated = await api.updateNote(id, changes);
        setNote(updated);
        callbacks.current.onChanged(updated);
        setSaveState(Object.keys(pending.current).length ? "dirty" : "saved");
        setError(null);
        if ("body" in changes) await refreshPreview();
      } catch (err) {
        pending.current = { ...changes, ...pending.current };
        setSaveState("error");
        if (err instanceof ApiError && err.status === 404) callbacks.current.onMissing();
        else setError(err instanceof ApiError ? err.message : "Could not save changes.");
      }
    };
    saving.current = saving.current.then(run);
    return saving.current;
  }, [id, refreshPreview]);

  useEffect(() => {
    let cancelled = false;
    setNote(null);
    setHtml("");
    setError(null);
    setSaveState("saved");
    pending.current = {};
    api
      .getNote(id)
      .then((n) => {
        if (cancelled) return;
        setNote(n);
        setTitle(n.title);
        setBody(n.body);
        refreshPreview();
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) callbacks.current.onMissing();
        else setError("Could not load note.");
      });
    return () => {
      cancelled = true;
      previewAbort.current?.abort();
      if (Object.keys(pending.current).length) void flush();
    };
  }, [id, refreshPreview, flush]);

  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (Object.keys(pending.current).length) {
        void flush();
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [flush]);

  function schedule(changes: { title?: string; body?: string }) {
    pending.current = { ...pending.current, ...changes };
    setSaveState("dirty");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), 500);
  }

  async function togglePublished() {
    if (!note) return;
    await flush();
    try {
      const updated = await api.updateNote(id, { published: !note.published });
      setNote(updated);
      onChanged(updated);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update note.");
    }
  }

  async function remove() {
    if (!window.confirm("Delete this note? This cannot be undone.")) return;
    window.clearTimeout(timer.current);
    pending.current = {};
    try {
      await api.deleteNote(id);
      onDeleted(id);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) onDeleted(id);
      else setError("Could not delete note.");
    }
  }

  async function copyLink() {
    const url = publicUrl(id);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const input = document.getElementById("public-link") as HTMLInputElement | null;
      input?.select();
      document.execCommand?.("copy");
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  if (!note) {
    return (
      <div className="flex flex-1 items-center justify-center text-slate-500">
        {error ?? "Loading…"}
      </div>
    );
  }

  const statusText = {
    saved: `Saved · ${formatDate(note.updated_at)}`,
    dirty: "Unsaved changes…",
    saving: "Saving…",
    error: "Save failed",
  }[saveState];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <input
          aria-label="Title"
          placeholder="Untitled"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            schedule({ title: e.target.value });
          }}
          onBlur={() => void flush()}
          className="min-w-0 flex-1 rounded-md border border-transparent px-2 py-1 text-xl font-semibold text-slate-800 hover:border-slate-200 focus:border-indigo-400 focus:outline-none"
        />
        <span
          className={`text-xs ${saveState === "error" ? "text-red-600" : "text-slate-400"}`}
          aria-live="polite"
        >
          {statusText}
        </span>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
          <button
            type="button"
            role="switch"
            aria-checked={note.published}
            aria-label="Published"
            onClick={togglePublished}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
              note.published ? "bg-emerald-500" : "bg-slate-300"
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                note.published ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
          Published
        </label>
        <button
          type="button"
          onClick={remove}
          className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
        >
          Delete
        </button>
      </div>

      {note.published && (
        <div className="flex flex-wrap items-center gap-2 border-b border-emerald-100 bg-emerald-50 px-4 py-2 text-sm">
          <span className="text-emerald-800">Public link:</span>
          <input
            id="public-link"
            readOnly
            value={publicUrl(id)}
            onFocus={(e) => e.target.select()}
            className="min-w-0 flex-1 rounded border border-emerald-200 bg-white px-2 py-1 font-mono text-xs text-slate-700"
          />
          <button
            type="button"
            onClick={copyLink}
            className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700"
          >
            {copied ? "Copied!" : "Copy link"}
          </button>
          <a
            href={publicUrl(id)}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-medium text-emerald-700 hover:underline"
          >
            Open
          </a>
        </div>
      )}

      {error && (
        <p role="alert" className="bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex border-b border-slate-200 bg-white md:hidden">
        {(["write", "preview"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 py-2 text-sm capitalize ${
              tab === t ? "border-b-2 border-indigo-600 font-medium text-indigo-700" : "text-slate-500"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 md:grid-cols-2">
        <textarea
          aria-label="Markdown"
          placeholder="Write Markdown here…"
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            schedule({ body: e.target.value });
          }}
          onBlur={() => void flush()}
          spellCheck
          className={`${tab === "write" ? "block" : "hidden"} min-h-[50vh] w-full resize-none border-0 bg-white p-4 font-mono text-sm leading-relaxed text-slate-800 focus:outline-none md:block md:min-h-0 md:border-r md:border-slate-200`}
        />
        <div
          className={`${tab === "preview" ? "block" : "hidden"} min-h-0 overflow-y-auto bg-slate-50 p-6 md:block`}
          aria-label="Preview"
        >
          {html.trim() ? (
            <div className="prose prose-slate max-w-none" dangerouslySetInnerHTML={{ __html: html }} />
          ) : (
            <p className="text-sm text-slate-400 italic">Nothing to preview yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

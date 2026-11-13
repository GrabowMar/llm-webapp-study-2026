import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { inputCls, proseCls, secondaryBtn } from "./ui";

type Props = { id: number; onChanged: () => void; onDeleted: () => void };

export default function Editor({ id, onChanged, onDeleted }: Props) {
  const [loaded, setLoaded] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [published, setPublished] = useState(false);
  const [html, setHtml] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const dirty = useRef(false);
  const seq = useRef(0);

  useEffect(() => {
    let live = true;
    Promise.all([api.getNote(id), api.noteHtml(id)]).then(
      ([note, rendered]) => {
        if (!live) return;
        setTitle(note.title);
        setBody(note.body);
        setPublished(note.published);
        setHtml(rendered);
        setLoaded(true);
      },
      (err) => live && setError(err instanceof Error ? err.message : "Failed to load"),
    );
    return () => {
      live = false;
    };
  }, [id]);

  useEffect(() => {
    if (!dirty.current) return;
    setStatus("Saving…");
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      try {
        await api.updateNote(id, { title, body });
        const rendered = await api.noteHtml(id);
        if (mine !== seq.current) return;
        setHtml(rendered);
        setStatus("Saved");
        setError("");
        onChanged();
      } catch (err) {
        if (mine !== seq.current) return;
        setStatus("");
        setError(err instanceof Error ? err.message : "Failed to save");
      }
    }, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, body]);

  async function togglePublished(next: boolean) {
    setError("");
    try {
      const note = await api.updateNote(id, { published: next });
      setPublished(note.published);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    }
  }

  async function remove() {
    if (!window.confirm("Delete this note?")) return;
    try {
      await api.deleteNote(id);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  async function copyLink() {
    const url = `${window.location.origin}/p/${id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Could not copy the link");
    }
  }

  if (!loaded) {
    return <p className="p-6 text-slate-500">{error || "Loading…"}</p>;
  }

  const publicUrl = `${window.location.origin}/p/${id}`;

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          aria-label="Title"
          className={`${inputCls} min-w-0 flex-1 text-base font-semibold`}
          value={title}
          placeholder="Title"
          onChange={(e) => {
            dirty.current = true;
            setTitle(e.target.value);
          }}
        />
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            role="switch"
            aria-label="Published"
            className="peer sr-only"
            checked={published}
            onChange={(e) => togglePublished(e.target.checked)}
          />
          <span className="relative h-6 w-11 rounded-full bg-slate-300 transition peer-checked:bg-green-500 peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-300 after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-5" />
          Published
        </label>
        <button className={secondaryBtn} onClick={remove}>
          Delete
        </button>
      </div>

      {published && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-green-200 bg-green-50 p-2 text-sm">
          <span className="font-medium text-green-900">Public link</span>
          <input
            readOnly
            aria-label="Public link"
            className={`${inputCls} min-w-0 flex-1`}
            value={publicUrl}
            onFocus={(e) => e.currentTarget.select()}
          />
          <button className={secondaryBtn} onClick={copyLink}>
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
      )}

      <div className="h-5 text-xs text-slate-500" aria-live="polite">
        {error ? <span className="text-red-600">{error}</span> : status}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <textarea
          aria-label="Markdown"
          className={`${inputCls} min-h-96 font-mono`}
          value={body}
          placeholder="Write Markdown…"
          onChange={(e) => {
            dirty.current = true;
            setBody(e.target.value);
          }}
        />
        <div
          aria-label="Preview"
          className={`${proseCls} min-h-96 rounded-md border border-slate-200 bg-white p-4`}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
}

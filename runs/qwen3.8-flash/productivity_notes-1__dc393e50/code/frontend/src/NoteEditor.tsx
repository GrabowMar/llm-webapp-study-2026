import { useMemo, useState } from "react";

export default function NoteEditor({
  initialTitle = "",
  initialContent = "",
  initialTags = [],
  initialPinned = false,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initialTitle?: string;
  initialContent?: string;
  initialTags?: string[];
  initialPinned?: boolean;
  submitLabel: string;
  onSubmit: (value: { title: string; content: string; tags: string[]; pinned: boolean }) => Promise<string[]>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const [tagText, setTagText] = useState(initialTags.join(", "));
  const [pinned, setPinned] = useState(initialPinned);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const tags = useMemo(
    () =>
      Array.from(
        new Set(
          tagText
            .split(",")
            .map((t) => t.trim().toLowerCase())
            .filter(Boolean),
        ),
      ),
    [tagText],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors([]);
    const errs = await onSubmit({ title, content, tags, pinned });
    setErrors(errs);
    setBusy(false);
  }

  const input =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200";

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Title</label>
        <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Content</label>
        <textarea
          className={`${input} min-h-48 font-mono`}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          required
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Tags</label>
        <input
          className={input}
          value={tagText}
          onChange={(e) => setTagText(e.target.value)}
          placeholder="comma, separated, tags"
        />
        {tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {tags.map((t) => (
              <span key={t} className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">
                #{t}
              </span>
            ))}
          </div>
        )}
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={pinned}
          onChange={(e) => setPinned(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 accent-emerald-600"
        />
        Pin this note
      </label>
      {errors.length > 0 && (
        <ul className="space-y-1 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
        >
          {busy ? "Saving…" : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

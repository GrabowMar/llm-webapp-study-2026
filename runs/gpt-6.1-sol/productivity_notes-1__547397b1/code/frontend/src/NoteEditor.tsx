import { useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { api, ApiError } from "./api";
import type { FieldErrors, Note, Session } from "./api";
import Icon from "./Icons";

export default function NoteEditor({ note, session, onSave, onCancel }: { note?: Note; session: Session; onSave: (note: Note) => void; onCancel: () => void }) {
  const [title, setTitle] = useState(note?.title ?? "");
  const [content, setContent] = useState(note?.content ?? "");
  const [tags, setTags] = useState<string[]>(note?.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [pinned, setPinned] = useState(note?.pinned ?? false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState("");

  function combinedTags() {
    return [...new Set([...tags, ...tagInput.split(",").map(tag => tag.trim().toLowerCase()).filter(Boolean)])];
  }

  function addTags() {
    setTags(combinedTags());
    setTagInput("");
  }

  function tagKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addTags();
    }
    if (event.key === "Backspace" && !tagInput) setTags(tags.slice(0, -1));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    setMessage("");
    try {
      const saved = await api<Note>(note ? `/notes/${note.id}` : "/notes", {
        method: note ? "PATCH" : "POST", token: session.token,
        body: { title, content, tags: combinedTags(), pinned },
      });
      onSave(saved);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Please try again.");
      if (error instanceof ApiError) setErrors(error.errors);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <button onClick={onCancel} disabled={busy} className="mb-8 flex items-center gap-2 text-xs text-muted transition hover:text-ink"><Icon name="back" className="size-4" />{note ? "Back to note" : "Back to all notes"}</button>
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">{note ? "A little refinement" : "A fresh page"}</p>
      <h1 className="font-serif text-4xl tracking-tight">{note ? "Edit your note." : "What’s on your mind?"}</h1>
      <p className="mt-3 text-sm text-muted">{note ? "Good thoughts can always grow." : "An idea, a reminder, a small discovery. Keep it here."}</p>
      <form onSubmit={submit} className="mt-8 overflow-hidden rounded-xl border border-line bg-white" noValidate>
        <div className="space-y-7 p-6 sm:p-9">
          <div>
            <label htmlFor="note-title" className="mb-2 block text-xs font-semibold">Title <span className="font-normal text-muted">(required)</span></label>
            <input id="note-title" autoFocus placeholder="Give your thought a title…" value={title} onChange={event => setTitle(event.target.value)} disabled={busy} aria-invalid={!!errors.title} aria-describedby={errors.title ? "title-error" : undefined} className="w-full border-b border-line bg-transparent pb-3 font-serif text-2xl placeholder:text-muted/50 focus:border-moss focus:outline-none" />
            {errors.title && <p id="title-error" className="mt-2 text-xs text-red-700">{errors.title}</p>}
          </div>
          <div>
            <label htmlFor="note-content" className="mb-3 block text-xs font-semibold">Your note</label>
            <textarea id="note-content" rows={11} placeholder="Start writing. There’s no right way to begin." value={content} onChange={event => setContent(event.target.value)} disabled={busy} aria-invalid={!!errors.content} aria-describedby={errors.content ? "content-error" : undefined} className="min-h-60 w-full resize-y rounded-lg border border-line bg-paper/50 p-4 text-sm leading-7 placeholder:text-muted/65 focus:border-moss focus:outline-none focus:ring-2 focus:ring-moss/10" />
            {errors.content && <p id="content-error" className="mt-2 text-xs text-red-700">{errors.content}</p>}
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted"><Icon name="notes" className="size-3" />Plain text. Just your words, as you wrote them.</p>
          </div>
          <div>
            <label htmlFor="note-tags" className="mb-2 block text-xs font-semibold">Tags <span className="font-normal text-muted">(optional)</span></label>
            <div className={`flex min-h-12 flex-wrap items-center gap-2 rounded-lg border p-2 focus-within:border-moss focus-within:ring-2 focus-within:ring-moss/10 ${errors.tags ? "border-red-400" : "border-line"}`}>
              {tags.map(tag => <span key={tag} className="flex max-w-full items-center gap-1.5 rounded-md bg-leaf px-2.5 py-1.5 text-xs"><span className="truncate">#{tag}</span><button type="button" aria-label={`Remove ${tag} tag`} onClick={() => setTags(tags.filter(value => value !== tag))} disabled={busy} className="rounded p-0.5 hover:bg-moss/10"><Icon name="close" className="size-3" /></button></span>)}
              <input id="note-tags" placeholder={tags.length ? "Add another…" : "ideas, work, little things…"} value={tagInput} onChange={event => setTagInput(event.target.value)} onKeyDown={tagKey} onBlur={addTags} disabled={busy} aria-invalid={!!errors.tags} aria-describedby={errors.tags ? "tags-error" : "tags-help"} className="min-w-32 flex-1 bg-transparent px-2 py-1 text-sm placeholder:text-muted/65 focus:outline-none" />
            </div>
            {errors.tags && <p id="tags-error" className="mt-2 text-xs text-red-700">{errors.tags}</p>}
            <p id="tags-help" className="mt-2 text-[11px] text-muted">Press Enter or use a comma to add a tag. Up to 12 tags, 40 characters each.</p>
          </div>
          <label className="flex cursor-pointer items-center gap-3 rounded-lg bg-paper p-4">
            <input type="checkbox" checked={pinned} onChange={event => setPinned(event.target.checked)} disabled={busy} className="size-4 accent-moss" />
            <Icon name="pin" className="size-4" /><span><span className="block text-xs font-medium">Pin this note</span><span className="mt-1 block text-[11px] text-muted">Keep the important things at the top.</span></span>
          </label>
          {message && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{message}{errors.fields && <span className="mt-1 block">{errors.fields}</span>}</p>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line bg-paper/50 px-6 py-5 sm:px-9">
          <span className="flex items-center gap-1.5 text-[11px] text-muted"><Icon name="globe" className="size-3.5" />This note will be public.</span>
          <div className="flex items-center gap-4"><button type="button" onClick={onCancel} disabled={busy} className="text-xs text-muted hover:text-ink">Cancel</button><button disabled={busy} className="flex items-center gap-2 rounded-lg bg-moss px-5 py-3 text-xs font-medium text-white transition hover:bg-ink">{busy ? "Saving…" : note ? "Save changes" : "Publish note"}<Icon name="check" className="size-4" /></button></div>
        </div>
      </form>
    </div>
  );
}

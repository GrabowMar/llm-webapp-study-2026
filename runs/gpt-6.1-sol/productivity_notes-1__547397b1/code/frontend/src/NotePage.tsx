import { useEffect, useState } from "react";
import { api, dateLabel } from "./api";
import type { Note, Session } from "./api";
import type { Navigate } from "./navigation";
import Icon from "./Icons";
import Link from "./Link";
import Modal from "./Modal";
import NoteEditor from "./NoteEditor";

export default function NotePage({ id, editing, session, navigate, onChanged, notify }: { id: number; editing: boolean; session: Session | null; navigate: Navigate; onChanged: () => void; notify: (message: string) => void }) {
  const [note, setNote] = useState<Note | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api<Note>(`/notes/${id}`, { signal: controller.signal }).then(setNote).catch(error => {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Unable to load this note.");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id, attempt]);

  async function togglePin() {
    if (!session || !note) return;
    setBusy(true);
    try {
      const changed = await api<Note>(`/notes/${id}`, { method: "PATCH", token: session.token, body: { pinned: !note.pinned } });
      setNote(changed);
      onChanged();
      notify(changed.pinned ? "Note pinned. A good thought, kept close." : "Note unpinned.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!session) return;
    setBusy(true);
    setDeleteError("");
    try {
      await api(`/notes/${id}`, { method: "DELETE", token: session.token });
      onChanged();
      notify("Note deleted. Room for a new thought.");
      navigate("/");
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div aria-busy="true" aria-label="Loading note" className="mx-auto max-w-3xl animate-pulse"><div className="mb-10 h-3 w-28 rounded bg-leaf" /><div className="h-96 rounded-xl border border-line bg-white/60" /></div>;
  if (error || !note) return <div className="mx-auto max-w-xl rounded-xl border border-line bg-white p-12 text-center"><Icon name="notes" className="mx-auto mb-4 size-8 text-muted" /><h1 className="font-serif text-3xl">This page is missing.</h1><p role="alert" className="mt-4 text-sm text-muted">{error || "Note not found."}</p><div className="mt-6 flex justify-center gap-5"><Link href="/" className="text-xs underline underline-offset-4">Back to the notebook</Link><button onClick={() => setAttempt(value => value + 1)} className="text-xs text-muted underline underline-offset-4">Try again</button></div></div>;

  const owned = session?.username === note.author;
  if (editing && owned && session) return <NoteEditor key={note.id} note={note} session={session} onSave={saved => { setNote(saved); onChanged(); notify("Changes saved. Nicely put."); navigate(`/notes/${id}`); }} onCancel={() => navigate(`/notes/${id}`)} />;
  if (editing && !owned) return <div className="rounded-xl border border-line bg-white p-10 text-center"><h1 className="font-serif text-3xl">This thought belongs to {note.author}.</h1><p className="mt-3 text-sm text-muted">Only the author can edit this note.</p><Link href={`/notes/${id}`} className="mt-5 inline-block text-xs underline underline-offset-4">Read the note</Link></div>;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/" className="mb-8 inline-flex items-center gap-2 text-xs text-muted hover:text-ink"><Icon name="back" className="size-4" />Back to the notebook</Link>
      <article className="overflow-hidden rounded-xl border border-line bg-white shadow-[0_4px_24px_-16px_#354b3e20]">
        <div className="border-b border-line bg-[#f0f3e8] px-7 py-8 sm:px-10 sm:py-10">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-moss/70"><Icon name={note.pinned ? "pin" : "notes"} className="size-3.5" />{note.pinned ? "Pinned thought" : "From the notebook"}</span><span className="flex items-center gap-1.5 text-[10px] text-muted"><Icon name="globe" className="size-3.5" />Public note</span></div>
          <h1 className="break-words font-serif text-4xl leading-[1.2] tracking-tight sm:text-5xl">{note.title}</h1>
          <div className="mt-6 flex flex-wrap items-center gap-3 text-[11px] text-muted"><Link href={`/?author=${encodeURIComponent(note.author)}`} className="flex items-center gap-2 hover:text-ink"><span className="flex size-7 items-center justify-center rounded-full border border-moss/10 bg-white/70 text-[10px] font-medium uppercase text-moss">{note.author.slice(0, 1)}</span><span className="font-medium text-moss">{note.author}</span></Link><span className="text-moss/20">/</span><span>Updated {dateLabel(note.updated_at)}</span></div>
        </div>
        <div className="px-7 py-9 sm:px-10"><p className="min-h-28 whitespace-pre-wrap break-words text-[15px] leading-[1.95] text-[#596254]">{note.content || <span className="italic text-muted">A quiet little note. No words added yet.</span>}</p>{!!note.tags.length && <div className="mt-9 flex flex-wrap gap-2 border-t border-line pt-6">{note.tags.map(tag => <Link key={tag} href={`/?tag=${encodeURIComponent(tag)}`} className="max-w-full truncate rounded-md border border-moss/5 bg-leaf px-3 py-1.5 text-[11px] text-moss transition hover:bg-moss/15">#{tag}</Link>)}</div>}</div>
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line bg-paper/70 px-7 py-5 sm:px-10"><span className="text-[10px] text-muted">Created {dateLabel(note.created_at)}</span>{owned && <div className="flex flex-wrap items-center gap-4"><button onClick={togglePin} disabled={busy} className="flex items-center gap-1.5 text-xs text-moss hover:underline"><Icon name="pin" className="size-3.5" />{note.pinned ? "Unpin" : "Pin note"}</button><Link href={`/notes/${id}/edit`} className="flex items-center gap-1.5 text-xs text-moss hover:underline"><Icon name="edit" className="size-3.5" />Edit</Link><button onClick={() => { setDeleting(true); setDeleteError(""); }} disabled={busy} className="flex items-center gap-1.5 text-xs text-[#a86e62] hover:underline"><Icon name="trash" className="size-3.5" />Delete</button></div>}</div>
      </article>
      <p className="mt-5 flex items-center justify-center gap-2 text-[10px] text-muted"><Icon name="book" className="size-3.5" />A small thought, part of a bigger notebook.</p>
      {deleting && <Modal title="Delete note" onClose={() => setDeleting(false)} busy={busy}><div className="mb-5 flex size-12 items-center justify-center rounded-xl bg-[#f7eae4] text-[#a86e62]"><Icon name="trash" className="size-5" /></div><h2 className="font-serif text-3xl">Let this thought go?</h2><p className="mt-4 break-words text-sm leading-6 text-muted">“{note.title}” will be permanently deleted. This can’t be undone.</p>{deleteError && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-xs text-red-700">{deleteError}</p>}<div className="mt-7 flex justify-end gap-3"><button disabled={busy} onClick={() => setDeleting(false)} className="rounded-lg border border-line px-4 py-2.5 text-xs">Keep note</button><button disabled={busy} onClick={remove} className="rounded-lg bg-[#a45f53] px-4 py-2.5 text-xs font-medium text-white hover:bg-[#8d5045]">{busy ? "Deleting…" : "Delete note"}</button></div></Modal>}
    </div>
  );
}

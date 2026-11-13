import { useEffect, useState } from "react";
import { api, PublicNote } from "./api";
import { proseCls } from "./ui";

export default function PublicPage({ id }: { id: number }) {
  const [note, setNote] = useState<PublicNote | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    api.publicNote(id).then(setNote, () => setMissing(true));
  }, [id]);

  if (missing) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-semibold">Note not found</h1>
      </main>
    );
  }
  if (!note) return <main className="mx-auto max-w-3xl p-6 text-slate-500">Loading…</main>;

  return (
    <main className="mx-auto max-w-3xl p-6">
      <article>
        <h1 className="text-3xl font-bold">{note.title || "Untitled"}</h1>
        <p className="mb-6 mt-1 text-sm text-slate-500">
          by <span data-testid="author">{note.author}</span>
        </p>
        <div className={proseCls} dangerouslySetInnerHTML={{ __html: note.html }} />
      </article>
    </main>
  );
}

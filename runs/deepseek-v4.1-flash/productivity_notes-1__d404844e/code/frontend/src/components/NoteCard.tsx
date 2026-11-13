import type { Note } from "../api";
import { navigate } from "../router";
import { formatDate } from "../utils";

interface Props {
  note: Note;
  onTag: (tag: string) => void;
}

export default function NoteCard({ note, onTag }: Props) {
  const preview =
    note.content.length > 220 ? `${note.content.slice(0, 220)}…` : note.content;

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-200 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <button
          onClick={() => navigate(`/notes/${note.id}`)}
          className="text-left text-lg font-semibold text-slate-900 hover:text-indigo-700"
        >
          {note.pinned && (
            <span className="mr-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 align-middle text-xs font-semibold uppercase tracking-wide text-amber-700">
              Pinned
            </span>
          )}
          {note.title}
        </button>
      </div>

      <p className="mt-2 whitespace-pre-line break-words text-sm text-slate-600">
        {preview}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {note.tags.map((tag) => (
          <button
            key={tag}
            onClick={() => onTag(tag)}
            className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
          >
            #{tag}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
        <span>
          by <span className="font-medium text-slate-700">{note.author}</span>
        </span>
        <span>Updated {formatDate(note.updated_at)}</span>
      </div>
    </article>
  );
}

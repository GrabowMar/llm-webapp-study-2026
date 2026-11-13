import { Link } from "react-router-dom";

import type { Note } from "../lib/api";

export function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function NoteCard({ note }: { note: Note }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-300 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-semibold text-slate-900">
          <Link
            to={`/notes/${note.id}`}
            className="hover:text-indigo-700 hover:underline"
          >
            {note.title}
          </Link>
        </h3>
        {note.pinned ? (
          <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
            Pinned
          </span>
        ) : null}
      </div>

      {note.content ? (
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">
          {note.content}
        </p>
      ) : null}

      {note.tags.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {note.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600"
            >
              #{tag}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
        <span>
          by <span className="font-medium text-slate-700">{note.author}</span>
        </span>
        <span>Updated {formatDate(note.updated_at)}</span>
      </div>
    </article>
  );
}

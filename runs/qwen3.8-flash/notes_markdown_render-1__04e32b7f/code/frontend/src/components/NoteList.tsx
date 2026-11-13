import type { NoteSummary } from "../types";
import { formatDate } from "../util";

export default function NoteList({
  notes,
  selectedId,
  onSelect,
  onNew,
}: {
  notes: NoteSummary[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onNew: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Notes
        </h2>
        <button
          onClick={onNew}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          + New
        </button>
      </div>
      <ul className="flex-1 space-y-1 overflow-y-auto px-2 pb-4">
        {notes.length === 0 && (
          <li className="px-2 py-6 text-center text-sm text-slate-400">
            No notes yet. Create one!
          </li>
        )}
        {notes.map((n) => (
          <li key={n.id}>
            <button
              onClick={() => onSelect(n.id)}
              className={`w-full rounded-lg px-3 py-2 text-left hover:bg-slate-100 ${
                selectedId === n.id ? "bg-indigo-50 ring-1 ring-indigo-200" : ""
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium text-slate-800">
                  {n.title || "Untitled"}
                </span>
                {n.published && (
                  <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                    Published
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-xs text-slate-400">
                Updated {formatDate(n.updated_at)}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

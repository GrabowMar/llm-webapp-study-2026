import type { TagCount } from "../api";

interface Props {
  tags: TagCount[];
  selected: string;
  onSelect: (tag: string) => void;
}

export default function TagCloud({ tags, selected, onSelect }: Props) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Tags
        </h2>
        {selected && (
          <button
            onClick={() => onSelect("")}
            className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
          >
            Clear
          </button>
        )}
      </div>
      {tags.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">No tags yet.</p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {tags.map(({ tag, count }) => {
            const active = selected.toLowerCase() === tag.toLowerCase();
            return (
              <button
                key={tag}
                onClick={() => onSelect(active ? "" : tag)}
                className={
                  "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm transition " +
                  (active
                    ? "border-indigo-600 bg-indigo-600 text-white"
                    : "border-slate-200 bg-slate-50 text-slate-700 hover:border-indigo-300 hover:bg-indigo-50")
                }
              >
                <span>{tag}</span>
                <span
                  className={
                    "rounded-full px-1.5 text-xs " +
                    (active ? "bg-indigo-500 text-white" : "bg-slate-200 text-slate-600")
                  }
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

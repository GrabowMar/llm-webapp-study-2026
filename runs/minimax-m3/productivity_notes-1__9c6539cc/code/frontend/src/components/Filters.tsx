import { useEffect, useState } from "react";

import { listAuthors, listTags, type AuthorCount, type TagCount } from "../lib/api";

type Props = {
  activeTag: string | null;
  onTagSelect: (tag: string | null) => void;
  activeAuthor: string | null;
  onAuthorSelect: (author: string | null) => void;
};

export function Filters({
  activeTag,
  onTagSelect,
  activeAuthor,
  onAuthorSelect,
}: Props) {
  const [tags, setTags] = useState<TagCount[]>([]);
  const [authors, setAuthors] = useState<AuthorCount[]>([]);
  const [tagError, setTagError] = useState<string | null>(null);
  const [authorError, setAuthorError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listTags()
      .then((data) => {
        if (alive) setTags(data.items);
      })
      .catch(() => {
        if (alive) setTagError("Could not load tags");
      });
    listAuthors()
      .then((data) => {
        if (alive) setAuthors(data.items);
      })
      .catch(() => {
        if (alive) setAuthorError("Could not load authors");
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <aside className="flex flex-col gap-6">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Tags
        </h2>
        {tagError ? (
          <p className="text-sm text-rose-600">{tagError}</p>
        ) : tags.length === 0 ? (
          <p className="text-sm text-slate-500">No tags yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {tags.map((item) => {
              const selected = activeTag === item.tag;
              return (
                <button
                  key={item.tag}
                  type="button"
                  onClick={() => onTagSelect(selected ? null : item.tag)}
                  aria-pressed={selected}
                  className={[
                    "rounded-full border px-3 py-1 text-sm transition",
                    selected
                      ? "border-indigo-600 bg-indigo-600 text-white"
                      : "border-slate-200 bg-slate-50 text-slate-700 hover:border-indigo-400 hover:text-indigo-700",
                  ].join(" ")}
                >
                  {item.tag}
                  <span
                    className={[
                      "ml-1.5 text-xs",
                      selected ? "text-indigo-100" : "text-slate-400",
                    ].join(" ")}
                  >
                    {item.count}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Authors
        </h2>
        {authorError ? (
          <p className="text-sm text-rose-600">{authorError}</p>
        ) : authors.length === 0 ? (
          <p className="text-sm text-slate-500">No authors yet.</p>
        ) : (
          <ul className="space-y-1">
            <li>
              <button
                type="button"
                onClick={() => onAuthorSelect(null)}
                className={[
                  "flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-sm",
                  activeAuthor === null
                    ? "bg-indigo-50 font-medium text-indigo-700"
                    : "text-slate-700 hover:bg-slate-50",
                ].join(" ")}
              >
                Everyone
              </button>
            </li>
            {authors.map((item) => {
              const selected = activeAuthor === item.author;
              return (
                <li key={item.author}>
                  <button
                    type="button"
                    onClick={() => onAuthorSelect(selected ? null : item.author)}
                    className={[
                      "flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-sm",
                      selected
                        ? "bg-indigo-50 font-medium text-indigo-700"
                        : "text-slate-700 hover:bg-slate-50",
                    ].join(" ")}
                  >
                    <span className="truncate">{item.author}</span>
                    <span className="ml-2 text-xs text-slate-400">{item.count}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </aside>
  );
}

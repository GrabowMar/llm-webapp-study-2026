import { useCallback, useEffect, useState } from "react";
import { api, type NotesPage, type TagCount } from "../api";
import NoteCard from "./NoteCard";
import TagCloud from "./TagCloud";

const PAGE_SIZE = 10;

interface Props {
  tag: string;
  author: string;
  query: string;
  onTagChange: (tag: string) => void;
  onAuthorChange: (author: string) => void;
  onQueryChange: (query: string) => void;
  refreshKey: number;
}

export default function NoteList({
  tag,
  author,
  query,
  onTagChange,
  onAuthorChange,
  onQueryChange,
  refreshKey,
}: Props) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<NotesPage | null>(null);
  const [tags, setTags] = useState<TagCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setPage(1);
  }, [tag, author, query]);

  const loadTags = useCallback(async () => {
    try {
      const result = await api<{ items: TagCount[] }>("/api/tags");
      setTags(result.items);
    } catch {
      setTags([]);
    }
  }, []);

  useEffect(() => {
    void loadTags();
  }, [loadTags, refreshKey]);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (tag) params.set("tag", tag);
    if (author) params.set("author", author);
    if (query) params.set("q", query);
    params.set("page", String(page));
    params.set("page_size", String(PAGE_SIZE));

    setLoading(true);
    setError("");
    api<NotesPage>(`/api/notes?${params.toString()}`)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err: { message?: string }) => {
        if (!cancelled) setError(err.message ?? "Could not load notes.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tag, author, query, page, refreshKey]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <div className="space-y-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Search
              </label>
              <input
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                placeholder="Search titles and content…"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Author
              </label>
              <input
                value={author}
                onChange={(e) => onAuthorChange(e.target.value)}
                placeholder="Any author"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={() => {
                  onQueryChange("");
                  onAuthorChange("");
                  onTagChange("");
                }}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Reset filters
              </button>
            </div>
          </div>
          {(tag || author || query) && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-500">Filtering by:</span>
              {tag && (
                <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-medium text-indigo-700">
                  tag: {tag}
                </span>
              )}
              {author && (
                <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-medium text-indigo-700">
                  author: {author}
                </span>
              )}
              {query && (
                <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-medium text-indigo-700">
                  search: {query}
                </span>
              )}
            </div>
          )}
        </section>

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        )}

        {loading ? (
          <p className="py-8 text-center text-sm text-slate-400">Loading notes…</p>
        ) : data && data.items.length > 0 ? (
          <div className="space-y-4">
            {data.items.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                onTag={(value) => onTagChange(value)}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-12 text-center text-sm text-slate-500">
            No notes match these filters.
          </div>
        )}

        {data && data.total > 0 && (
          <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
            <span className="text-slate-500">
              {data.total} note{data.total === 1 ? "" : "s"} · page {data.page} of{" "}
              {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      <aside className="space-y-4">
        <TagCloud tags={tags} selected={tag} onSelect={onTagChange} />
      </aside>
    </div>
  );
}

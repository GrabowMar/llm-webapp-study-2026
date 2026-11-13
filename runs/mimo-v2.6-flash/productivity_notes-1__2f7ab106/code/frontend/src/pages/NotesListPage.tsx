import { useEffect, useState } from "react";
import { api, ApiError, type Note, type NoteFilters, type NoteListResponse, type TagCount } from "../api";
import { ErrorAlert, PinnedBadge, Spinner, TagChip } from "../components/ui";
import { formatDate } from "../format";

type Props = {
  filters: NoteFilters;
  onFiltersChange: (patch: Partial<NoteFilters>) => void;
  tags: TagCount[];
  onOpenNote: (id: number) => void;
};

function NoteCard({ note, onOpen, onTag }: { note: Note; onOpen: () => void; onTag: (tag: string) => void }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-300 hover:shadow">
      <div className="flex items-start justify-between gap-3">
        <button type="button" onClick={onOpen} className="text-left">
          <h2 className="text-base font-semibold text-slate-900 hover:text-indigo-700">
            {note.title}
          </h2>
        </button>
        {note.pinned && <PinnedBadge />}
      </div>
      <p className="mt-2 line-clamp-2 whitespace-pre-wrap break-words text-sm text-slate-600">
        {note.content}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {note.tags.map((tag) => (
          <TagChip key={tag} onClick={() => onTag(tag)}>
            {tag}
          </TagChip>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
        <span className="font-medium text-slate-600">{note.author}</span>
        <span>updated {formatDate(note.updated_at)}</span>
        <button type="button" onClick={onOpen} className="text-indigo-600 hover:underline">
          Read more
        </button>
      </div>
    </article>
  );
}

export default function NotesListPage({ filters, onFiltersChange, tags, onOpenNote }: Props) {
  const [data, setData] = useState<NoteListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(filters.q);
  const [authorInput, setAuthorInput] = useState(filters.author);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (search !== filters.q || authorInput !== filters.author) {
        onFiltersChange({ q: search, author: authorInput, page: 1 });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search, authorInput, filters.q, filters.author, onFiltersChange]);

  const { q, author, tag, page, page_size } = filters;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .listNotes({ q, author, tag, page, page_size })
      .then((res) => {
        if (!cancelled) {
          setData(res);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Failed to load notes.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [q, author, tag, page, page_size]);

  const pageSize = data?.page_size ?? page_size ?? 10;
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const hasFilters = Boolean(q.trim() || author.trim() || tag.trim());

  function pickTag(next: string) {
    onFiltersChange({ tag: next === tag ? "" : next, page: 1 });
  }

  function clearFilters() {
    setSearch("");
    setAuthorInput("");
    onFiltersChange({ q: "", author: "", tag: "", page: 1 });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_240px]">
      <section>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search notes…"
            aria-label="Search notes"
            className="min-w-48 flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          />
          <input
            type="text"
            value={authorInput}
            onChange={(event) => setAuthorInput(event.target.value)}
            placeholder="Filter by author…"
            aria-label="Filter by author"
            className="min-w-40 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          />
          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              Clear
            </button>
          )}
        </div>

        {tag && (
          <p className="mb-3 text-sm text-slate-600">
            Filtering by tag{" "}
            <button
              type="button"
              onClick={() => pickTag(tag)}
              className="font-semibold text-indigo-700 hover:underline"
            >
              #{tag} ×
            </button>
          </p>
        )}

        <ErrorAlert message={error} />
        {loading && !data && <Spinner label="Loading notes…" />}

        <div className="space-y-4">
          {data?.items.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              onOpen={() => onOpenNote(note.id)}
              onTag={(t) => pickTag(t)}
            />
          ))}
        </div>

        {data && data.items.length === 0 && !loading && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <p className="font-medium text-slate-700">No notes found</p>
            <p className="mt-1 text-sm text-slate-500">
              {hasFilters
                ? "Try different search terms or clear the filters."
                : "Sign in and write the first note."}
            </p>
          </div>
        )}

        {data && total > 0 && (
          <nav
            aria-label="Pagination"
            className="mt-6 flex items-center justify-between gap-3 text-sm text-slate-600"
          >
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => onFiltersChange({ page: page - 1 })}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            <span>
              Page {page} of {pageCount} · {total} note{total === 1 ? "" : "s"}
            </span>
            <button
              type="button"
              disabled={page >= pageCount}
              onClick={() => onFiltersChange({ page: page + 1 })}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </nav>
        )}
      </section>

      <aside className="lg:sticky lg:top-20 lg:self-start">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Tags
            </h2>
            {tag && (
              <button
                type="button"
                onClick={() => pickTag(tag)}
                className="text-xs text-indigo-600 hover:underline"
              >
                clear
              </button>
            )}
          </div>
          {tags.length === 0 ? (
            <p className="text-sm text-slate-500">No tags yet.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {tags.map(({ tag: name, count }) => (
                <span key={name} title={`${count} note${count === 1 ? "" : "s"}`}>
                  <TagChip active={name === tag} onClick={() => pickTag(name)}>
                    {name} <span className="ml-1 opacity-70">{count}</span>
                  </TagChip>
                </span>
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

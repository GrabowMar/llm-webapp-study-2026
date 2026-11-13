import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { Filters } from "../components/Filters";
import { NoteCard } from "../components/NoteCard";
import { listNotes, type NoteList } from "../lib/api";
import { useAuth } from "../lib/auth";

const PAGE_SIZE = 10;

export function NoteListPage() {
  const { isSignedIn } = useAuth();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [author, setAuthor] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<NoteList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [tag, author]);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    listNotes({ tag: tag ?? undefined, author: author ?? undefined, q: query || undefined, page, pageSize: PAGE_SIZE })
      .then(setData)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [tag, author, query, page]);

  useEffect(() => {
    load();
  }, [load]);

  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Notes</h1>
          <p className="mt-1 text-sm text-slate-500">
            Everyone&apos;s notes, pinned first. {total} note{total === 1 ? "" : "s"}.
          </p>
        </div>
        {isSignedIn ? (
          <Link
            to="/notes/new"
            className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            New note
          </Link>
        ) : (
          <Link
            to="/login"
            className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Sign in to write
          </Link>
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[16rem_1fr]">
        <Filters
          activeTag={tag}
          onTagSelect={setTag}
          activeAuthor={author}
          onAuthorSelect={setAuthor}
        />

        <section className="min-w-0">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search titles and content…"
                aria-label="Search notes"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              />
            </div>
            {(query || tag || author) && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setTag(null);
                  setAuthor(null);
                }}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-50"
              >
                Clear filters
              </button>
            )}
          </div>

          {error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          ) : loading ? (
            <p className="py-10 text-center text-sm text-slate-500">Loading notes…</p>
          ) : data && data.items.length > 0 ? (
            <div className="space-y-4">
              {data.items.map((note) => (
                <NoteCard key={note.id} note={note} />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
              <p className="text-sm text-slate-600">No notes match these filters.</p>
              <Link
                to="/notes/new"
                className="mt-3 inline-block text-sm font-medium text-indigo-700 hover:underline"
              >
                Write the first one
              </Link>
            </div>
          )}

          {pageCount > 1 ? (
            <nav className="mt-6 flex items-center justify-between" aria-label="Pagination">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-sm text-slate-500">
                Page {page} of {pageCount}
              </span>
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                disabled={page >= pageCount}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </nav>
          ) : null}
        </section>
      </div>
    </div>
  );
}

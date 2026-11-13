import { useEffect, useState } from "react";
import { ApiError, deleteBook, listBooks } from "../api";
import type { Book } from "../api";
import { ErrorBanner, Stars, btnDanger, btnSecondary } from "../ui";
import { navigate } from "../router";

const PAGE_SIZE = 10;

interface Props {
  authed: boolean;
}

export default function BookList({ authed }: Props) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: Book[]; total: number; page: number; page_size: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQuery(query);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listBooks(debouncedQuery, page, PAGE_SIZE)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Failed to load books.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, page]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  async function removeBook(book: Book) {
    if (!window.confirm(`Delete “${book.title}” and its reviews? This cannot be undone.`)) return;
    setError(null);
    try {
      await deleteBook(book.id);
      const res = await listBooks(debouncedQuery, page, PAGE_SIZE);
      setData(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Delete failed.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Books</h1>
        <div className="flex items-center gap-3">
          <input
            className="w-64 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            placeholder="Search title or author…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search books"
          />
          {authed && (
            <button
              onClick={() => navigate("/books/new")}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
            >
              Add book
            </button>
          )}
        </div>
      </div>

      <ErrorBanner message={error} />

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Author</th>
              <th className="px-4 py-3">Year</th>
              <th className="px-4 py-3">Rating</th>
              <th className="px-4 py-3">Reviews</th>
              {authed && <th className="px-4 py-3 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            ) : data && data.items.length > 0 ? (
              data.items.map((book) => (
                <tr key={book.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium">
                    <a href={`#/books/${book.id}`} className="text-indigo-700 hover:underline">
                      {book.title}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{book.author}</td>
                  <td className="px-4 py-3 text-slate-600">{book.year ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Stars value={book.average_rating} />
                  </td>
                  <td className="px-4 py-3 text-slate-600">{book.review_count}</td>
                  {authed && (
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-2">
                        <a
                          href={`#/books/${book.id}/edit`}
                          className={btnSecondary + " px-3! py-1!"}
                        >
                          Edit
                        </a>
                        <button
                          onClick={() => removeBook(book)}
                          className={btnDanger + " px-3! py-1!"}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                  No books found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-slate-600">
        <span>
          {data ? `${data.total} book${data.total === 1 ? "" : "s"}` : ""}
        </span>
        <div className="flex items-center gap-2">
          <button
            className={btnSecondary + " px-3! py-1!"}
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            ← Prev
          </button>
          <span className="tabular-nums">
            Page {page} of {totalPages}
          </span>
          <button
            className={btnSecondary + " px-3! py-1!"}
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}

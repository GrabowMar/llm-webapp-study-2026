import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, errorMessage } from "../api";
import type { Book, BookListResponse } from "../api";
import { useAuth } from "../auth";
import { Link } from "../router";
import { Alert, Pagination, RatingStars, Spinner, inputClass } from "../components/ui";

const PAGE_SIZE = 10;

export default function BooksPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<BookListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.listBooks({ q: query, page, pageSize: PAGE_SIZE });
      setData(result);
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [query, page]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleDelete(book: Book) {
    const confirmed = window.confirm(
      `Delete "${book.title}"${book.review_count > 0 ? ` and its ${book.review_count} review(s)` : ""}?`,
    );
    if (!confirmed) return;
    try {
      await api.deleteBook(book.id);
      setNotice(`Deleted "${book.title}".`);
      setError(null);
      if ((data?.items.length ?? 0) === 1 && page > 1) {
        setPage(page - 1);
      } else {
        void load();
      }
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuery(search.trim());
    setPage(1);
  }

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Books</h1>
          <p className="text-sm text-slate-500">Browse the shared catalogue and its reviews.</p>
        </div>
        {user ? (
          <Link
            to="/books/new"
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
          >
            Add book
          </Link>
        ) : null}
      </div>

      <form onSubmit={handleSearchSubmit} className="flex flex-wrap gap-2">
        <div className="min-w-[16rem] flex-1">
          <label htmlFor="search" className="sr-only">
            Search books
          </label>
          <input
            id="search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by title, author or ISBN…"
            className={inputClass}
          />
        </div>
        <button
          type="submit"
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Search
        </button>
        {search ? (
          <button
            type="button"
            onClick={() => setSearch("")}
            className="rounded-md px-3 py-2 text-sm font-medium text-slate-500 transition hover:text-slate-800"
          >
            Clear
          </button>
        ) : null}
      </form>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th scope="col" className="px-4 py-3 text-left font-semibold text-slate-600">
                Title
              </th>
              <th scope="col" className="px-4 py-3 text-left font-semibold text-slate-600">
                Author
              </th>
              <th scope="col" className="px-4 py-3 text-left font-semibold text-slate-600">
                Year
              </th>
              <th scope="col" className="px-4 py-3 text-left font-semibold text-slate-600">
                Average rating
              </th>
              {user ? (
                <th scope="col" className="px-4 py-3 text-right font-semibold text-slate-600">
                  Actions
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((book) => (
              <tr key={book.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link
                    to={`/books/${book.id}`}
                    className="font-semibold text-indigo-700 transition hover:text-indigo-900"
                  >
                    {book.title}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {book.review_count} review{book.review_count === 1 ? "" : "s"}
                  </p>
                </td>
                <td className="px-4 py-3 text-slate-700">{book.author}</td>
                <td className="px-4 py-3 text-slate-700">{book.year ?? "—"}</td>
                <td className="px-4 py-3">
                  <RatingStars value={book.average_rating} />
                </td>
                {user ? (
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-3">
                      <Link
                        to={`/books/${book.id}/edit`}
                        className="font-medium text-slate-600 transition hover:text-indigo-600"
                      >
                        Edit
                      </Link>
                      <button
                        type="button"
                        onClick={() => void handleDelete(book)}
                        className="font-medium text-rose-600 transition hover:text-rose-800"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
            {!loading && items.length === 0 ? (
              <tr>
                <td
                  colSpan={user ? 5 : 4}
                  className="px-4 py-10 text-center text-slate-500"
                >
                  {query ? `No books match “${query}”.` : "No books yet. Add the first one!"}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {loading ? (
        <div className="flex justify-center py-2">
          <Spinner label="Loading books…" />
        </div>
      ) : (
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
      )}

      {user ? (
        <p className="text-xs text-slate-400">
          Any signed-in user can add, edit or delete books. Deleting a book also removes its reviews.
        </p>
      ) : (
        <p className="text-xs text-slate-400">Sign in to add books and leave reviews.</p>
      )}

      </div>
  );
}

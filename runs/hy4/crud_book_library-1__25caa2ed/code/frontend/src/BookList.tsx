import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import type { Navigate, Session } from "./App";
import { Button, inputClass, Stars } from "./components";
import type { Book, BookPage } from "./types";

const PAGE_SIZE = 10;

export default function BookList({
  session,
  navigate,
}: {
  session: Session | null;
  navigate: Navigate;
}) {
  const [result, setResult] = useState<BookPage | null>(null);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setResult(await api.books(search, page, PAGE_SIZE));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load books.");
    } finally {
      setLoading(false);
    }
  }, [search, page]);

  useEffect(() => {
    load();
  }, [load]);

  const onSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setPage(1);
    setSearch(query);
  };

  const totalPages = result
    ? Math.max(1, Math.ceil(result.total / result.page_size))
    : 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Books</h1>
          <p className="text-sm text-slate-500">
            Browse the shared catalogue and reader reviews.
          </p>
        </div>
        {session && (
          <Button onClick={() => navigate("/books/new")}>Add a book</Button>
        )}
      </div>

      <form onSubmit={onSearch} className="flex gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by title, author or ISBN…"
          className={inputClass}
          aria-label="Search books"
        />
        <Button type="submit">Search</Button>
      </form>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <Th>Title</Th>
              <Th>Author</Th>
              <Th>Year</Th>
              <Th>Average rating</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && result === null ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            ) : result && result.items.length > 0 ? (
              result.items.map((book: Book) => (
                <tr
                  key={book.id}
                  onClick={() => navigate(`/books/${book.id}`)}
                  className="cursor-pointer transition hover:bg-indigo-50"
                >
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/books/${book.id}`);
                      }}
                      className="font-medium text-indigo-700 hover:underline"
                    >
                      {book.title}
                    </button>
                    <span className="ml-2 text-xs text-slate-400">
                      {book.review_count}{" "}
                      {book.review_count === 1 ? "review" : "reviews"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {book.author}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {book.year ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {book.average_rating === null ? (
                      <span className="text-slate-400">Not rated</span>
                    ) : (
                      <span className="inline-flex items-center gap-2">
                        <span className="font-semibold text-slate-800">
                          {book.average_rating.toFixed(1)}
                        </span>
                        <Stars rating={Math.round(book.average_rating)} />
                      </span>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-slate-500">
                  {search
                    ? "No books match your search."
                    : "No books yet. Add the first one!"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {result && result.total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
          <span>
            Showing {(result.page - 1) * result.page_size + 1}–
            {Math.min(result.page * result.page_size, result.total)} of{" "}
            {result.total}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <span className="px-1">
              Page {result.page} of {totalPages}
            </span>
            <Button
              variant="secondary"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
      {children}
    </th>
  );
}

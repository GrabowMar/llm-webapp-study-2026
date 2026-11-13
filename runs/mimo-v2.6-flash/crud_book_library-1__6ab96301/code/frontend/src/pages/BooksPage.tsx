import { useEffect, useState } from "react";
import { ApiError, Book, BookPage, apiFetch } from "../api";

const PAGE_SIZE = 10;

type Props = {
  username: string | null;
  navigate: (path: string) => void;
};

export default function BooksPage({ username, navigate }: Props) {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<BookPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    params.set("page", String(page));
    params.set("page_size", String(PAGE_SIZE));
    apiFetch<BookPage>(`/api/books?${params.toString()}`)
      .then((res) => {
        if (!cancelled) {
          setData(res);
          setError(null);
        }
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
  }, [search, page]);

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const items = data?.items ?? [];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Books</h1>
        {username && (
          <button
            type="button"
            onClick={() => navigate("/books/new")}
            className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Add book
          </button>
        )}
      </div>

      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setSearch(query.trim());
        }}
      >
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by title, author or ISBN…"
          aria-label="Search books"
          className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <button
          type="submit"
          className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
        >
          Search
        </button>
        {search && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setSearch("");
              setPage(1);
            }}
            className="rounded px-3 py-2 text-sm text-gray-500 hover:text-gray-800"
          >
            Clear
          </button>
        )}
      </form>

      {error && (
        <p className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Author</th>
              <th className="px-4 py-3">Year</th>
              <th className="px-4 py-3 text-right">Average rating</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                  Loading…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                  {search ? `No books match “${search}”.` : "No books yet."}
                </td>
              </tr>
            ) : (
              items.map((book: Book) => (
                <tr
                  key={book.id}
                  className="cursor-pointer border-b border-gray-100 last:border-0 hover:bg-gray-50"
                  onClick={() => navigate(`/books/${book.id}`)}
                >
                  <td className="px-4 py-3 font-medium">
                    <a
                      href={`/books/${book.id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        navigate(`/books/${book.id}`);
                      }}
                      className="text-indigo-700 hover:underline"
                    >
                      {book.title}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{book.author}</td>
                  <td className="px-4 py-3 text-gray-700">{book.year ?? "—"}</td>
                  <td className="px-4 py-3 text-right text-gray-700">
                    {book.average_rating === null ? (
                      <span className="text-gray-400">No reviews</span>
                    ) : (
                      <>
                        <span className="font-medium">{book.average_rating.toFixed(1)}</span>
                        <span className="ml-1 text-gray-400">({book.review_count})</span>
                      </>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-gray-600">
            {total} book{total === 1 ? "" : "s"} · Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="rounded border border-gray-300 bg-white px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
              className="rounded border border-gray-300 bg-white px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

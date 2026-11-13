import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Book, BookList, apiBooks } from "./api";

function Stars({ rating }: { rating: number | null }) {
  if (rating === null) return <span className="text-slate-400">—</span>;
  return (
    <span className="text-amber-500">
      {"★".repeat(Math.round(rating))}
      <span className="text-slate-300">{"★".repeat(5 - Math.round(rating))}</span>
    </span>
  );
}

export default function BookListPage() {
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<BookList | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    apiBooks(search, page, 10)
      .then(setData)
      .catch(() => setError("Could not load books"))
      .finally(() => setLoading(false));
  }, [search, page]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    setSearch(q);
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <div className="mx-auto mt-6 max-w-4xl px-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Books</h1>
        <Link
          to="/books/new"
          className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Add book
        </Link>
      </div>

      <form onSubmit={handleSearch} className="mb-4 flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by title or author"
          className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        />
        <button type="submit" className="rounded bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
          Search
        </button>
      </form>

      {error && <p className="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              <th className="px-4 py-3 font-medium">Title</th>
              <th className="px-4 py-3 font-medium">Author</th>
              <th className="px-4 py-3 font-medium">Year</th>
              <th className="px-4 py-3 font-medium">Rating</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && data?.items.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                  No books found
                </td>
              </tr>
            )}
            {!loading &&
              data?.items.map((book) => (
                <tr key={book.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link to={`/books/${book.id}`} className="font-medium text-indigo-600 hover:underline">
                      {book.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{book.author}</td>
                  <td className="px-4 py-3 text-slate-700">{book.year ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Stars rating={book.average_rating} />
                    <span className="ml-1 text-xs text-slate-400">({book.review_count})</span>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {data && (
        <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
          <span>
            Page {data.page} of {totalPages} ({data.total} books)
          </span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-50 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
              className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-50 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

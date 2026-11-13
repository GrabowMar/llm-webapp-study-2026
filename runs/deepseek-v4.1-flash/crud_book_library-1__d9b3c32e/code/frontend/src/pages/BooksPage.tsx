import { useEffect, useRef, useState } from "react";
import { listBooks, type Book, type PagedBooks } from "../api";
import { Link, navigate, useQueryParams } from "../router";
import { useAuth, useDocumentTitle } from "../auth";
import { ErrorMessage, errorText, Stars } from "../components/ui";

const PAGE_SIZE = 10;

export default function BooksPage() {
  useDocumentTitle("Books");
  const params = useQueryParams();
  const q = params.get("q") ?? "";
  const page = Math.max(1, parseInt(params.get("page") ?? "1", 10) || 1);

  const [search, setSearch] = useState(q);
  const [data, setData] = useState<PagedBooks | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { username } = useAuth();
  const firstRender = useRef(true);

  useEffect(() => setSearch(q), [q]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listBooks({ q, page, page_size: PAGE_SIZE })
      .then((res) => {
        if (!cancelled) {
          setData(res);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(errorText(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [q, page]);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const id = window.setTimeout(() => {
      const next = new URLSearchParams();
      if (search.trim()) next.set("q", search.trim());
      const qs = next.toString();
      navigate(qs ? `/?${qs}` : "/", true);
    }, 350);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const goToPage = (next: number) => {
    if (next < 1 || next > totalPages) return;
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (next > 1) sp.set("page", String(next));
    const qs = sp.toString();
    navigate(qs ? `/?${qs}` : "/");
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Books</h1>
          <p className="mt-1 text-sm text-slate-500">
            {total} {total === 1 ? "book" : "books"} in the catalogue
          </p>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, author or ISBN…"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 sm:w-72"
          />
          {username && (
            <Link
              to="/books/new"
              className="hidden shrink-0 rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 sm:inline-block"
            >
              Add book
            </Link>
          )}
        </div>
      </div>

      <ErrorMessage message={error} />

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Author</th>
              <th className="px-4 py-3">Year</th>
              <th className="px-4 py-3">Rating</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && !data ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            ) : data && data.items.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                  {q
                    ? `No books match “${q}”.`
                    : "No books yet. Add the first one!"}
                </td>
              </tr>
            ) : (
              data?.items.map((book: Book) => (
                <tr key={book.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link
                      to={`/books/${book.id}`}
                      className="font-medium text-indigo-600 hover:underline"
                    >
                      {book.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{book.author}</td>
                  <td className="px-4 py-3 text-slate-500">
                    {book.year ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Stars rating={book.average_rating} />
                    <span className="ml-2 text-xs text-slate-400">
                      ({book.review_count})
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-slate-600">
        <span>
          Page {page} of {totalPages}
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => goToPage(page - 1)}
            disabled={page <= 1}
            className="rounded-md border border-slate-300 px-3 py-1.5 font-medium enabled:hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Previous
          </button>
          <button
            onClick={() => goToPage(page + 1)}
            disabled={page >= totalPages}
            className="rounded-md border border-slate-300 px-3 py-1.5 font-medium enabled:hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

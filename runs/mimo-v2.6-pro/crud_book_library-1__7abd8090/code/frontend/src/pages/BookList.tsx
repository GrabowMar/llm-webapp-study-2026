import { useEffect, useState } from "react";

import { listBooks } from "../api";
import {
  ErrorBox,
  primaryButtonClass,
  secondaryButtonClass,
  inputClass,
} from "../components/ui";
import type { Auth, Route } from "../route";
import type { Book } from "../types";

const PAGE_SIZE = 10;

export default function BookList({
  auth,
  navigate,
}: {
  auth: Auth | null;
  navigate: (route: Route) => void;
}) {
  const [items, setItems] = useState<Book[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listBooks({ q: search || undefined, page, pageSize })
      .then((data) => {
        if (cancelled) return;
        setItems(data.items);
        setTotal(data.total);
        setPageSize(data.page_size);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load books");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [search, page, pageSize]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Books</h1>
        {auth ? (
          <button className={primaryButtonClass} onClick={() => navigate({ name: "add" })}>
            Add book
          </button>
        ) : null}
      </div>

      <form
        className="mb-4 flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setSearch(query.trim());
        }}
      >
        <input
          className={`${inputClass} flex-1 min-w-48`}
          type="search"
          value={query}
          placeholder="Search by title, author or ISBN"
          aria-label="Search books"
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit" className={secondaryButtonClass}>
          Search
        </button>
        {search ? (
          <button
            type="button"
            className={secondaryButtonClass}
            onClick={() => {
              setQuery("");
              setSearch("");
              setPage(1);
            }}
          >
            Clear
          </button>
        ) : null}
      </form>

      <ErrorBox message={error} />

      <div className="overflow-x-auto rounded-lg bg-white shadow">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-sm uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Author</th>
              <th className="px-4 py-3">Year</th>
              <th className="px-4 py-3">Average rating</th>
            </tr>
          </thead>
          <tbody>
            {items.map((book) => (
              <tr key={book.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td className="px-4 py-3">
                  <button
                    className="font-medium text-indigo-700 hover:underline"
                    onClick={() => navigate({ name: "book", id: book.id })}
                  >
                    {book.title}
                  </button>
                </td>
                <td className="px-4 py-3 text-slate-700">{book.author}</td>
                <td className="px-4 py-3 text-slate-700">{book.year ?? "—"}</td>
                <td className="px-4 py-3 text-slate-700">
                  {book.average_rating === null ? "No reviews" : book.average_rating.toFixed(1)}
                </td>
              </tr>
            ))}
            {!loading && items.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                  No books found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <button
          className={secondaryButtonClass}
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          Previous
        </button>
        <span className="text-sm text-slate-600">
          Page {page} of {pageCount} ({total} {total === 1 ? "book" : "books"})
        </span>
        <button
          className={secondaryButtonClass}
          disabled={page >= pageCount}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { api, type BookPage } from "./api";
import { Link } from "./router";
import { btn, btnSecondary, ErrorMessage, input, Rating } from "./ui";

const PAGE_SIZE = 10;

export function BookList({ signedIn }: { signedIn: boolean }) {
  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<BookPage | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    setError("");
    api
      .listBooks(q, page, PAGE_SIZE)
      .then((d) => live && setData(d))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [q, page]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <form
          className="flex flex-1 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setQ(draft.trim());
          }}
        >
          <input
            className={input}
            type="search"
            placeholder="Search title or author"
            aria-label="Search"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button className={btnSecondary}>Search</button>
        </form>
        {signedIn && (
          <Link to="/books/new" className={btn}>
            Add book
          </Link>
        )}
      </div>
      <ErrorMessage>{error}</ErrorMessage>
      <div className="overflow-hidden rounded bg-white shadow">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="px-4 py-2">Title</th>
              <th className="px-4 py-2">Author</th>
              <th className="px-4 py-2">Year</th>
              <th className="px-4 py-2">Rating</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((b) => (
              <tr key={b.id} className="border-t border-slate-100">
                <td className="px-4 py-2">
                  <Link to={`/books/${b.id}`} className="text-indigo-600 hover:underline">
                    {b.title}
                  </Link>
                </td>
                <td className="px-4 py-2">{b.author}</td>
                <td className="px-4 py-2">{b.year ?? ""}</td>
                <td className="px-4 py-2">
                  <Rating value={b.average_rating} />
                </td>
              </tr>
            ))}
            {data && data.items.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                  No books found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-600">
          {data ? `${data.total} book${data.total === 1 ? "" : "s"}` : "Loading..."}
        </span>
        <div className="flex items-center gap-2">
          <button className={btnSecondary} disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous
          </button>
          <span>
            Page {page} of {pages}
          </span>
          <button className={btnSecondary} disabled={page >= pages} onClick={() => setPage(page + 1)}>
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

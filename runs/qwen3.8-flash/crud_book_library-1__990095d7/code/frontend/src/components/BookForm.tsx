import { useEffect, useState } from "react";
import { ApiError, createBook, getBook, updateBook } from "../api";
import { ErrorBanner, btnPrimary, btnSecondary, cardCls, inputCls, labelCls } from "../ui";
import { navigate } from "../router";

interface Props {
  bookId: number | null;
  onSaved: () => void;
}

export default function BookForm({ bookId, onSaved }: Props) {
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [year, setYear] = useState("");
  const [isbn, setIsbn] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(bookId !== null);

  useEffect(() => {
    if (bookId === null) return;
    getBook(bookId)
      .then((b) => {
        setTitle(b.title);
        setAuthor(b.author);
        setYear(b.year === null ? "" : String(b.year));
        setIsbn(b.isbn ?? "");
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load book."))
      .finally(() => setLoading(false));
  }, [bookId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const payload: Record<string, unknown> = {
      title: title.trim(),
      author: author.trim(),
      year: year.trim() === "" ? null : Number(year.trim()),
      isbn: isbn.trim() === "" ? null : isbn.trim(),
    };
    try {
      const book = bookId === null ? await createBook(payload) : await updateBook(bookId, payload);
      onSaved();
      navigate(`/books/${book.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the book.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="py-10 text-center text-slate-400">Loading…</p>;

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-2xl font-bold text-slate-900">
        {bookId === null ? "Add book" : "Edit book"}
      </h1>
      <form onSubmit={submit} className={cardCls + " space-y-4"}>
        <div>
          <label className={labelCls} htmlFor="f-title">Title *</label>
          <input
            id="f-title"
            className={inputCls}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="f-author">Author *</label>
          <input
            id="f-author"
            className={inputCls}
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls} htmlFor="f-year">Year</label>
            <input
              id="f-year"
              className={inputCls}
              type="number"
              inputMode="numeric"
              placeholder="e.g. 1965"
              value={year}
              onChange={(e) => setYear(e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="f-isbn">ISBN</label>
            <input
              id="f-isbn"
              className={inputCls}
              placeholder="e.g. 978-0-441-17271-9"
              value={isbn}
              onChange={(e) => setIsbn(e.target.value)}
            />
          </div>
        </div>
        <ErrorBanner message={error} />
        <div className="flex gap-3 pt-2">
          <button type="submit" className={btnPrimary} disabled={busy}>
            {busy ? "Saving…" : bookId === null ? "Add book" : "Save changes"}
          </button>
          <button type="button" className={btnSecondary} onClick={() => navigate("/")}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

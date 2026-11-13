import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { ApiError, api, errorMessage } from "../api";
import type { Book } from "../api";
import { Link, navigate } from "../router";
import { Alert, Spinner, TextField } from "../components/ui";

export default function BookFormPage({ bookId }: { bookId?: number }) {
  const editing = bookId !== undefined;
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [year, setYear] = useState("");
  const [isbn, setIsbn] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) return;
    let cancelled = false;
    api
      .getBook(bookId)
      .then((book: Book) => {
        if (cancelled) return;
        setTitle(book.title);
        setAuthor(book.author);
        setYear(book.year === null ? "" : String(book.year));
        setIsbn(book.isbn ?? "");
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(errorMessage(caught));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [editing, bookId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setSaving(true);
    const payload = {
      title: title.trim(),
      author: author.trim(),
      year: year.trim() === "" ? null : Number(year.trim()),
      isbn: isbn.trim() === "" ? null : isbn.trim(),
    };
    try {
      const saved = editing
        ? await api.updateBook(bookId as number, payload)
        : await api.createBook(payload);
      navigate(`/books/${saved.id}`);
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message);
        setFieldErrors(caught.errors);
      } else {
        setError("Could not save the book.");
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading book…" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link to="/" className="text-sm font-semibold text-indigo-700 transition hover:text-indigo-900">
          ← Back to books
        </Link>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">
          {editing ? "Edit book" : "Add a book"}
        </h1>
        <p className="text-sm text-slate-500">
          {editing
            ? "Changes replace the current details."
            : "Add a title to the shared catalogue."}
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <TextField
          id="title"
          label="Title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          error={fieldErrors.title}
          placeholder="Dune"
        />
        <TextField
          id="author"
          label="Author"
          value={author}
          onChange={(event) => setAuthor(event.target.value)}
          error={fieldErrors.author}
          placeholder="Frank Herbert"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="year"
            label="Year"
            value={year}
            onChange={(event) => setYear(event.target.value)}
            error={fieldErrors.year}
            inputMode="numeric"
            placeholder="1965"
          />
          <TextField
            id="isbn"
            label="ISBN"
            value={isbn}
            onChange={(event) => setIsbn(event.target.value)}
            error={fieldErrors.isbn}
            placeholder="9780441013593"
          />
        </div>

        {error ? <Alert tone="error">{error}</Alert> : null}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving…" : editing ? "Save changes" : "Add book"}
          </button>
          <Link
            to={editing && bookId !== undefined ? `/books/${bookId}` : "/"}
            className="text-sm font-medium text-slate-600 transition hover:text-slate-900"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

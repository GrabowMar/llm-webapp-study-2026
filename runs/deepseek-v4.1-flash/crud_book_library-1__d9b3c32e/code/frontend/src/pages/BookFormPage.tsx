import { useEffect, useState } from "react";
import { createBook, getBook, updateBook, type BookInput } from "../api";
import { Link, navigate } from "../router";
import { useAuth, useDocumentTitle } from "../auth";
import { ErrorMessage, errorText } from "../components/ui";

const EMPTY: BookInput = { title: "", author: "", year: "", isbn: "" };

export default function BookFormPage({ id }: { id?: number }) {
  const editing = id !== undefined;
  const { username } = useAuth();
  const [form, setForm] = useState<BookInput>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(editing);
  const [submitting, setSubmitting] = useState(false);

  useDocumentTitle(editing ? "Edit book" : "Add book");

  useEffect(() => {
    if (!editing) return;
    let cancelled = false;
    setLoading(true);
    getBook(id)
      .then((book) => {
        if (cancelled) return;
        setForm({
          title: book.title,
          author: book.author,
          year: book.year === null ? "" : String(book.year),
          isbn: book.isbn ?? "",
        });
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
  }, [editing, id]);

  if (!username) {
    return (
      <div className="space-y-4">
        <p className="text-slate-600">
          You need to{" "}
          <Link to="/auth" className="font-medium text-indigo-600 hover:underline">
            sign in
          </Link>{" "}
          to {editing ? "edit" : "add"} books.
        </p>
      </div>
    );
  }

  const set = (key: keyof BookInput) => (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setForm({ ...form, [key]: e.target.value });
    setFieldErrors((prev) => ({ ...prev, [key]: "" }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setFieldErrors({});
    try {
      if (editing) {
        await updateBook(id, form);
      } else {
        const created = await createBook(form);
        navigate(`/books/${created.id}`);
        return;
      }
      navigate(`/books/${id}`);
    } catch (err) {
      const message = errorText(err);
      setError(message);
      const lower = message.toLowerCase();
      const next: Record<string, string> = {};
      if (lower.includes("title")) next.title = message;
      if (lower.includes("author")) next.author = message;
      if (lower.includes("year")) next.year = message;
      if (lower.includes("isbn")) next.isbn = message;
      setFieldErrors(next);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <p className="text-slate-500">Loading…</p>;

  const inputClass =
    "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <Link to={editing ? `/books/${id}` : "/"} className="text-sm text-indigo-600 hover:underline">
        ← {editing ? "Back to book" : "Back to books"}
      </Link>
      <h1 className="text-2xl font-bold tracking-tight">
        {editing ? "Edit book" : "Add a book"}
      </h1>

      <form
        onSubmit={submit}
        className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
      >
        <ErrorMessage message={error} />
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Title <span className="text-red-500">*</span>
          </label>
          <input
            value={form.title}
            onChange={set("title")}
            className={inputClass}
            placeholder="The Great Gatsby"
          />
          {fieldErrors.title && (
            <p className="mt-1 text-xs text-red-600">{fieldErrors.title}</p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Author <span className="text-red-500">*</span>
          </label>
          <input
            value={form.author}
            onChange={set("author")}
            className={inputClass}
            placeholder="F. Scott Fitzgerald"
          />
          {fieldErrors.author && (
            <p className="mt-1 text-xs text-red-600">{fieldErrors.author}</p>
          )}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Year
            </label>
            <input
              value={form.year}
              onChange={set("year")}
              inputMode="numeric"
              className={inputClass}
              placeholder="1925"
            />
            {fieldErrors.year && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.year}</p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              ISBN
            </label>
            <input
              value={form.isbn}
              onChange={set("isbn")}
              className={inputClass}
              placeholder="9780743273565"
            />
            {fieldErrors.isbn && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.isbn}</p>
            )}
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {submitting ? "Saving…" : editing ? "Save changes" : "Add book"}
          </button>
          <button
            type="button"
            onClick={() => navigate(editing ? `/books/${id}` : "/")}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

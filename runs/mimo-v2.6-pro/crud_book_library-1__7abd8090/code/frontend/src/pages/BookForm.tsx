import { useEffect, useState } from "react";

import { createBook, getBook, updateBook } from "../api";
import {
  ErrorBox,
  Field,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "../components/ui";
import type { Route } from "../route";

export default function BookForm({
  bookId,
  navigate,
}: {
  bookId?: number;
  navigate: (route: Route) => void;
}) {
  const editing = bookId !== undefined;
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [year, setYear] = useState("");
  const [isbn, setIsbn] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (bookId === undefined) return;
    let cancelled = false;
    getBook(bookId)
      .then((book) => {
        if (cancelled) return;
        setTitle(book.title);
        setAuthor(book.author);
        setYear(book.year === null ? "" : String(book.year));
        setIsbn(book.isbn ?? "");
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load book");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const payload: { title: string; author: string; year?: number | string; isbn?: string } = {
      title,
      author,
    };
    const trimmedYear = year.trim();
    if (trimmedYear !== "") {
      const parsed = Number(trimmedYear);
      payload.year = Number.isInteger(parsed) ? parsed : trimmedYear;
    }
    const trimmedIsbn = isbn.trim();
    if (trimmedIsbn !== "") {
      payload.isbn = trimmedIsbn;
    }
    try {
      const saved = editing
        ? await updateBook(bookId, payload)
        : await createBook(payload);
      navigate({ name: "book", id: saved.id });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save book");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-4 text-2xl font-bold text-slate-900">
        {editing ? "Edit book" : "Add book"}
      </h1>
      <ErrorBox message={error} />
      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <form className="rounded-lg bg-white p-6 shadow" onSubmit={handleSubmit}>
          <Field label="Title">
            <input
              className={inputClass}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
          <Field label="Author">
            <input
              className={inputClass}
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
            />
          </Field>
          <Field label="Year" hint="Optional. Leave empty to clear.">
            <input
              className={inputClass}
              value={year}
              onChange={(e) => setYear(e.target.value)}
            />
          </Field>
          <Field label="ISBN" hint="Optional. Leave empty to clear.">
            <input
              className={inputClass}
              value={isbn}
              onChange={(e) => setIsbn(e.target.value)}
            />
          </Field>
          <div className="flex gap-2">
            <button type="submit" className={primaryButtonClass} disabled={saving}>
              {saving ? "Saving…" : editing ? "Save changes" : "Add book"}
            </button>
            <button
              type="button"
              className={secondaryButtonClass}
              onClick={() =>
                navigate(editing ? { name: "book", id: bookId } : { name: "list" })
              }
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

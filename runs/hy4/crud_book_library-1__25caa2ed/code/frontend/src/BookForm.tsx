import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, ApiError } from "./api";
import type { Navigate } from "./App";
import { Alert, Button, Field, inputClass } from "./components";
import type { BookInput, FieldErrors } from "./types";

const emptyForm = {
  title: "",
  author: "",
  year: "",
  isbn: "",
};

export default function BookForm({
  mode,
  bookId,
  navigate,
}: {
  mode: "create" | "edit";
  bookId?: number;
  navigate: Navigate;
}) {
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(mode === "edit");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (mode !== "edit" || bookId === undefined) return;
    api
      .book(bookId)
      .then((book) => {
        setForm({
          title: book.title,
          author: book.author,
          year: book.year === null ? "" : String(book.year),
          isbn: book.isbn ?? "",
        });
      })
      .catch((err) =>
        setMessage(err instanceof Error ? err.message : "Could not load the book."),
      )
      .finally(() => setLoading(false));
  }, [mode, bookId]);

  const change = (field: keyof typeof emptyForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setErrors({});
    setMessage("");
    setBusy(true);
    const payload: BookInput = {
      title: form.title.trim(),
      author: form.author.trim(),
      year: form.year.trim() === "" ? null : Number(form.year),
      isbn: form.isbn.trim() === "" ? null : form.isbn.trim(),
    };
    try {
      const book =
        mode === "create"
          ? await api.createBook(payload)
          : await api.updateBook(bookId!, payload);
      navigate(`/books/${book.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.errors);
        setMessage(err.message);
      } else {
        setMessage("Could not save the book.");
      }
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <p className="text-center text-slate-500">Loading…</p>;
  }

  return (
    <div className="mx-auto max-w-xl">
      <div className="rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-2xl font-bold text-slate-900">
          {mode === "create" ? "Add a book" : "Edit book"}
        </h1>
        <p className="mb-6 text-sm text-slate-500">
          {mode === "create"
            ? "Add a new title to the shared catalogue."
            : "Update the details of this book."}
        </p>

        {message && (
          <div className="mb-4">
            <Alert message={message} />
          </div>
        )}

        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label="Title" name="title" error={errors.title}>
            <input
              id="title"
              value={form.title}
              onChange={(e) => change("title", e.target.value)}
              className={inputClass}
              placeholder="e.g. The Hobbit"
            />
          </Field>
          <Field label="Author" name="author" error={errors.author}>
            <input
              id="author"
              value={form.author}
              onChange={(e) => change("author", e.target.value)}
              className={inputClass}
              placeholder="e.g. J.R.R. Tolkien"
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Year" name="year" error={errors.year}>
              <input
                id="year"
                type="number"
                value={form.year}
                onChange={(e) => change("year", e.target.value)}
                className={inputClass}
                placeholder="e.g. 1937"
              />
            </Field>
            <Field label="ISBN" name="isbn" error={errors.isbn}>
              <input
                id="isbn"
                value={form.isbn}
                onChange={(e) => change("isbn", e.target.value)}
                className={inputClass}
                placeholder="optional"
              />
            </Field>
          </div>
          <p className="text-xs text-slate-400">
            Leave year or ISBN blank to clear them.
          </p>

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : mode === "create" ? "Add book" : "Save changes"}
            </Button>
            <Button variant="secondary" onClick={() => navigate("/")}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

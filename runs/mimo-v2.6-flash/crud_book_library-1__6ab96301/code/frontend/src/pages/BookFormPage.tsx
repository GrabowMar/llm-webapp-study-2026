import { FormEvent, useEffect, useState } from "react";
import { ApiError, Book, apiFetch } from "../api";

type Props = {
  mode: "add" | "edit";
  bookId?: number;
  navigate: (path: string) => void;
  onApiError: (err: unknown) => void;
};

type FormState = { title: string; author: string; year: string; isbn: string };

const emptyForm: FormState = { title: "", author: "", year: "", isbn: "" };

export default function BookFormPage({ mode, bookId, navigate, onApiError }: Props) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(mode === "edit");
  const [busy, setBusy] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (mode !== "edit" || bookId === undefined) return;
    apiFetch<Book>(`/api/books/${bookId}`)
      .then((book) => {
        setForm({
          title: book.title,
          author: book.author,
          year: book.year === null ? "" : String(book.year),
          isbn: book.isbn ?? "",
        });
        setLoading(false);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) setNotFound(true);
        else setError(err instanceof ApiError ? err.message : "Failed to load book.");
        setLoading(false);
      });
  }, [mode, bookId]);

  function set<K extends keyof FormState>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    const body = {
      title: form.title,
      author: form.author,
      year: form.year.trim() === "" ? null : form.year.trim(),
      isbn: form.isbn.trim() === "" ? null : form.isbn.trim(),
    };
    try {
      if (mode === "add") {
        const created = await apiFetch<Book>("/api/books", { method: "POST", body });
        navigate(`/books/${created.id}`);
      } else {
        await apiFetch(`/api/books/${bookId}`, { method: "PUT", body });
        navigate(`/books/${bookId}`);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFields(err.fields);
        onApiError(err);
      } else {
        setError("Failed to save book.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (notFound) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-lg text-gray-600">This book does not exist.</p>
        <button
          type="button"
          onClick={() => navigate("/")}
          className="mt-4 text-indigo-600 hover:underline"
        >
          Back to books
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <button
        type="button"
        onClick={() => navigate(mode === "edit" ? `/books/${bookId}` : "/")}
        className="text-sm text-gray-500 hover:text-gray-800"
      >
        ← {mode === "edit" ? "Back to book" : "All books"}
      </button>
      <h1 className="mt-4 text-2xl font-semibold">
        {mode === "add" ? "Add book" : "Edit book"}
      </h1>

      {loading ? (
        <p className="mt-6 text-gray-500">Loading…</p>
      ) : (
        <form
          onSubmit={submit}
          className="mt-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
        >
          {error && (
            <p className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          <div className="space-y-4">
            <div>
              <label htmlFor="title" className="block text-sm font-medium text-gray-700">
                Title
              </label>
              <input
                id="title"
                type="text"
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              {fields.title && <p className="mt-1 text-sm text-red-600">{fields.title}</p>}
            </div>
            <div>
              <label htmlFor="author" className="block text-sm font-medium text-gray-700">
                Author
              </label>
              <input
                id="author"
                type="text"
                value={form.author}
                onChange={(e) => set("author", e.target.value)}
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              {fields.author && <p className="mt-1 text-sm text-red-600">{fields.author}</p>}
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="year" className="block text-sm font-medium text-gray-700">
                  Year <span className="font-normal text-gray-400">(optional)</span>
                </label>
                <input
                  id="year"
                  type="text"
                  inputMode="numeric"
                  value={form.year}
                  onChange={(e) => set("year", e.target.value)}
                  placeholder="e.g. 1965"
                  className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                {fields.year && <p className="mt-1 text-sm text-red-600">{fields.year}</p>}
              </div>
              <div>
                <label htmlFor="isbn" className="block text-sm font-medium text-gray-700">
                  ISBN <span className="font-normal text-gray-400">(optional)</span>
                </label>
                <input
                  id="isbn"
                  type="text"
                  value={form.isbn}
                  onChange={(e) => set("isbn", e.target.value)}
                  placeholder="e.g. 9780441172719"
                  className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                {fields.isbn && <p className="mt-1 text-sm text-red-600">{fields.isbn}</p>}
              </div>
            </div>
          </div>
          <div className="mt-6 flex gap-3">
            <button
              type="submit"
              disabled={busy}
              className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {busy ? "Saving…" : mode === "add" ? "Add book" : "Save changes"}
            </button>
            <button
              type="button"
              onClick={() => navigate(mode === "edit" ? `/books/${bookId}` : "/")}
              className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

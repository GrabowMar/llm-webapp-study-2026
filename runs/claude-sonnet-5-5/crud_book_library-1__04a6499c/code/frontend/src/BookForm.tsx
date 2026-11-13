import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError, type BookInput } from "./api";
import { navigate } from "./router";
import { btn, btnSecondary, ErrorMessage, Field, input } from "./ui";

export function BookForm({ id }: { id?: number }) {
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [year, setYear] = useState("");
  const [isbn, setIsbn] = useState("");
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(id !== undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (id === undefined) return;
    api
      .getBook(id)
      .then((b) => {
        setTitle(b.title);
        setAuthor(b.author);
        setYear(b.year === null ? "" : String(b.year));
        setIsbn(b.isbn ?? "");
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setFields({});
    const body: BookInput = { title, author };
    if (year.trim() !== "") {
      const n = Number(year);
      if (!Number.isInteger(n)) {
        setFields({ year: "Year must be a whole number" });
        return;
      }
      body.year = n;
    }
    if (isbn.trim() !== "") body.isbn = isbn.trim();
    setBusy(true);
    try {
      const saved = id === undefined ? await api.createBook(body) : await api.updateBook(id, body);
      navigate(`/books/${saved.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setFields(err.fields);
        setError(Object.keys(err.fields).length ? "" : err.message);
      } else {
        setError("Network error");
      }
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p>Loading...</p>;
  return (
    <form onSubmit={submit} className="mx-auto max-w-lg space-y-4 rounded bg-white p-6 shadow">
      <h1 className="text-xl font-semibold">{id === undefined ? "Add book" : "Edit book"}</h1>
      <ErrorMessage>{error}</ErrorMessage>
      <Field label="Title" error={fields.title}>
        <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Author" error={fields.author}>
        <input className={input} value={author} onChange={(e) => setAuthor(e.target.value)} />
      </Field>
      <Field label="Year" error={fields.year}>
        <input className={input} value={year} onChange={(e) => setYear(e.target.value)} inputMode="numeric" />
      </Field>
      <Field label="ISBN" error={fields.isbn}>
        <input className={input} value={isbn} onChange={(e) => setIsbn(e.target.value)} />
      </Field>
      <div className="flex gap-2">
        <button className={btn} disabled={busy}>
          Save
        </button>
        <button type="button" className={btnSecondary} onClick={() => window.history.back()}>
          Cancel
        </button>
      </div>
    </form>
  );
}

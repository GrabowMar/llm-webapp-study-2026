import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError, Book, apiBook, apiCreateBook, apiUpdateBook } from "./api";

interface Props {
  editing?: boolean;
}

export default function BookForm({ editing = false }: Props) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [year, setYear] = useState("");
  const [isbn, setIsbn] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!editing) return;
    const bookId = Number(id);
    apiBook(bookId)
      .then((b: Book) => {
        setTitle(b.title);
        setAuthor(b.author);
        setYear(b.year === null ? "" : String(b.year));
        setIsbn(b.isbn ?? "");
      })
      .catch(() => setGlobalError("Could not load book"));
  }, [editing, id]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setGlobalError(null);
    setLoading(true);

    const payload = {
      title: title.trim(),
      author: author.trim(),
      year: year.trim() === "" ? null : Number(year),
      isbn: isbn.trim() === "" ? null : isbn.trim(),
    };

    try {
      if (editing) {
        const updated = await apiUpdateBook(Number(id), payload);
        navigate(`/books/${updated.id}`);
      } else {
        const created = await apiCreateBook(payload);
        navigate(`/books/${created.id}`);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields || {});
        setGlobalError(err.message);
      } else {
        setGlobalError("Something went wrong");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto mt-10 max-w-md">
      <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">{editing ? "Edit book" : "Add a book"}</h1>
        {globalError && !Object.keys(errors).length && (
          <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{globalError}</p>
        )}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
          {errors.title && <p className="mt-1 text-sm text-red-600">{errors.title}</p>}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Author</label>
          <input
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
          {errors.author && <p className="mt-1 text-sm text-red-600">{errors.author}</p>}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Year</label>
          <input
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
          {errors.year && <p className="mt-1 text-sm text-red-600">{errors.year}</p>}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">ISBN</label>
          <input
            value={isbn}
            onChange={(e) => setIsbn(e.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
          {errors.isbn && <p className="mt-1 text-sm text-red-600">{errors.isbn}</p>}
        </div>
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading}
            className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? "Saving…" : editing ? "Save changes" : "Add book"}
          </button>
          <Link to={editing ? `/books/${id}` : "/"} className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

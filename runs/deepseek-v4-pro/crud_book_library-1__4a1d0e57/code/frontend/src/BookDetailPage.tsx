import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "./AuthContext";
import ReviewForm from "./ReviewForm";
import { Book, Review, apiBook, apiDeleteBook, apiReviews } from "./api";

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString();
}

export default function BookDetailPage() {
  const { id } = useParams();
  const bookId = Number(id);
  const navigate = useNavigate();
  const { auth } = useAuth();

  const [book, setBook] = useState<Book | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadReviews = useCallback(() => {
    apiReviews(bookId)
      .then((r) => setReviews(r.items))
      .catch(() => setError("Could not load reviews"));
  }, [bookId]);

  useEffect(() => {
    apiBook(bookId)
      .then((b) => {
        setBook(b);
        setError(null);
      })
      .catch(() => setError("Book not found"));
    loadReviews();
  }, [bookId, loadReviews]);

  async function handleDelete() {
    if (!window.confirm(`Delete "${book?.title}" and all its reviews?`)) return;
    setDeleting(true);
    try {
      await apiDeleteBook(bookId);
      navigate("/");
    } catch {
      setError("Could not delete book");
      setDeleting(false);
    }
  }

  if (error === "Book not found") {
    return (
      <div className="mx-auto mt-10 max-w-2xl px-4 text-center">
        <p className="text-slate-600">This book could not be found.</p>
        <Link to="/" className="mt-2 inline-block text-indigo-600 hover:underline">
          Back to books
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto mt-6 max-w-2xl px-4">
      <Link to="/" className="text-sm text-indigo-600 hover:underline">
        ← Back to books
      </Link>

      {error && error !== "Book not found" && (
        <p className="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {book && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">{book.title}</h1>
              <p className="text-slate-600">by {book.author}</p>
            </div>
            {auth.token && (
              <div className="flex gap-2">
                <Link
                  to={`/books/${book.id}/edit`}
                  className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                >
                  Edit
                </Link>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-slate-500">Year</dt>
            <dd className="text-slate-800">{book.year ?? "—"}</dd>
            <dt className="text-slate-500">ISBN</dt>
            <dd className="text-slate-800">{book.isbn ?? "—"}</dd>
            <dt className="text-slate-500">Average rating</dt>
            <dd className="text-slate-800">
              {book.average_rating === null ? "No reviews yet" : `${book.average_rating} / 5`}
            </dd>
          </dl>
        </div>
      )}

      <h2 className="mt-8 mb-3 text-lg font-semibold text-slate-900">Reviews ({reviews.length})</h2>

      {auth.token && book && (
        <div className="mb-6">
          <ReviewForm
            bookId={book.id}
            onCreated={(review) => {
              setReviews((prev) => [review, ...prev]);
              loadReviews();
            }}
          />
        </div>
      )}

      {!auth.token && (
        <p className="mb-6 rounded bg-slate-50 px-3 py-2 text-sm text-slate-600">
          <Link to="/login" className="text-indigo-600 hover:underline">
            Sign in
          </Link>{" "}
          to leave a review.
        </p>
      )}

      <div className="space-y-4">
        {reviews.length === 0 && <p className="text-slate-500">No reviews yet.</p>}
        {reviews.map((review) => (
          <div key={review.id} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-900">{review.username}</span>
              <span className="text-amber-500">{"★".repeat(review.rating)}</span>
            </div>
            <p className="mt-2 text-slate-700">{review.comment}</p>
            <p className="mt-2 text-xs text-slate-400">{formatDate(review.created_at)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

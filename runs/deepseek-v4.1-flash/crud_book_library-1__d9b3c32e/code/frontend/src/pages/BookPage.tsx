import { useCallback, useEffect, useState } from "react";
import {
  createReview,
  deleteBook,
  getBook,
  listReviews,
  type Book,
  type Review,
} from "../api";
import { Link, navigate } from "../router";
import { useAuth, useDocumentTitle } from "../auth";
import {
  ErrorMessage,
  errorText,
  formatDate,
  Stars,
} from "../components/ui";

export default function BookPage({ id }: { id: number }) {
  const { username } = useAuth();
  const [book, setBook] = useState<Book | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useDocumentTitle(book?.title ?? "Book");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [b, r] = await Promise.all([getBook(id), listReviews(id)]);
      setBook(b);
      setReviews(r.items);
      setError(null);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const alreadyReviewed =
    !!username && reviews.some((r) => r.username === username);

  const submitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      await createReview(id, rating, comment);
      setComment("");
      setRating(5);
      await load();
    } catch (err) {
      setFormError(errorText(err));
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async () => {
    if (!book) return;
    if (!window.confirm(`Delete “${book.title}”? This cannot be undone.`)) {
      return;
    }
    try {
      await deleteBook(id);
      navigate("/");
    } catch (err) {
      setError(errorText(err));
    }
  };

  if (loading && !book) {
    return <p className="text-slate-500">Loading…</p>;
  }

  if (error && !book) {
    return (
      <div className="space-y-4">
        <ErrorMessage message={error} />
        <Link to="/" className="text-sm text-indigo-600 hover:underline">
          ← Back to books
        </Link>
      </div>
    );
  }

  if (!book) return null;

  return (
    <div className="space-y-8">
      <Link to="/" className="text-sm text-indigo-600 hover:underline">
        ← Back to books
      </Link>

      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{book.title}</h1>
            <p className="mt-1 text-slate-600">
              by <span className="font-medium">{book.author}</span>
              {book.year ? ` · ${book.year}` : ""}
            </p>
            {book.isbn && (
              <p className="mt-1 text-sm text-slate-400">ISBN {book.isbn}</p>
            )}
            <div className="mt-3 flex items-center gap-2">
              <Stars rating={book.average_rating} />
              <span className="text-sm text-slate-500">
                {book.review_count}{" "}
                {book.review_count === 1 ? "review" : "reviews"}
              </span>
            </div>
          </div>
          {username && (
            <div className="flex shrink-0 gap-2">
              <Link
                to={`/books/${book.id}/edit`}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Edit
              </Link>
              <button
                onClick={remove}
                className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Reviews</h2>

        {username ? (
          alreadyReviewed ? (
            <p className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              You have already reviewed this book.
            </p>
          ) : (
            <form
              onSubmit={submitReview}
              className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
            >
              <h3 className="text-sm font-semibold text-slate-700">
                Write a review
              </h3>
              <ErrorMessage message={formError} />
              <div className="flex items-center gap-2">
                <label className="text-sm text-slate-600" htmlFor="rating">
                  Rating
                </label>
                <select
                  id="rating"
                  value={rating}
                  onChange={(e) => setRating(Number(e.target.value))}
                  className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
                >
                  {[5, 4, 3, 2, 1].map((n) => (
                    <option key={n} value={n}>
                      {n} {n === 1 ? "star" : "stars"}
                    </option>
                  ))}
                </select>
              </div>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                placeholder="Share your thoughts (optional)…"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
              <button
                type="submit"
                disabled={submitting}
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {submitting ? "Posting…" : "Post review"}
              </button>
            </form>
          )
        ) : (
          <p className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <Link to="/auth" className="font-medium text-indigo-600 hover:underline">
              Sign in
            </Link>{" "}
            to review this book.
          </p>
        )}

        {reviews.length === 0 ? (
          <p className="text-sm text-slate-500">No reviews yet.</p>
        ) : (
          <ul className="space-y-3">
            {reviews.map((review) => (
              <li
                key={review.id}
                className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{review.username}</span>
                    <Stars rating={review.rating} />
                  </div>
                  <span className="text-xs text-slate-400">
                    {formatDate(review.created_at)}
                  </span>
                </div>
                {review.comment && (
                  <p className="mt-2 whitespace-pre-line text-sm text-slate-700">
                    {review.comment}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

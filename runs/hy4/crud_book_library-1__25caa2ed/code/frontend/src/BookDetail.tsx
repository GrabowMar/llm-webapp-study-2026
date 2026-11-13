import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, ApiError } from "./api";
import type { Navigate, Session } from "./App";
import {
  Alert,
  Button,
  Field,
  formatDate,
  Stars,
} from "./components";
import type { Book, FieldErrors, Review } from "./types";

export default function BookDetail({
  bookId,
  session,
  navigate,
}: {
  bookId: number;
  session: Session | null;
  navigate: Navigate;
}) {
  const [book, setBook] = useState<Book | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [bookData, reviewData] = await Promise.all([
        api.book(bookId),
        api.reviews(bookId),
      ]);
      setBook(bookData);
      setReviews(reviewData.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the book.");
    } finally {
      setLoading(false);
    }
  }, [bookId]);

  useEffect(() => {
    load();
  }, [load]);

  const onDelete = async () => {
    setDeleting(true);
    try {
      await api.deleteBook(bookId);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the book.");
      setConfirmDelete(false);
      setDeleting(false);
    }
  };

  if (loading && !book) {
    return <p className="text-center text-slate-500">Loading…</p>;
  }
  if (!book) {
    return (
      <div className="space-y-4">
        <Alert message={error || "Book not found."} />
        <Button variant="secondary" onClick={() => navigate("/")}>
          Back to books
        </Button>
      </div>
    );
  }

  const alreadyReviewed = !!(
    session &&
    reviews.some((r) => r.username === session.username)
  );

  return (
    <div className="space-y-8">
      <Button variant="ghost" onClick={() => navigate("/")}>
        ← Back to books
      </Button>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">{book.title}</h1>
            <p className="mt-1 text-slate-600">by {book.author}</p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-indigo-700">
              {book.average_rating === null
                ? "—"
                : book.average_rating.toFixed(1)}
            </div>
            <div className="text-xs text-slate-500">
              {book.review_count}{" "}
              {book.review_count === 1 ? "review" : "reviews"}
            </div>
            {book.average_rating !== null && (
              <Stars rating={Math.round(book.average_rating)} />
            )}
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4 text-sm sm:grid-cols-3">
          <Detail label="Year" value={book.year === null ? "—" : String(book.year)} />
          <Detail label="ISBN" value={book.isbn || "—"} />
          <Detail label="Added" value={formatDate(book.created_at)} />
        </dl>

        {session && (
          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
            <Button variant="secondary" onClick={() => navigate(`/books/${book.id}/edit`)}>
              Edit
            </Button>
            {confirmDelete ? (
              <span className="flex items-center gap-2">
                <span className="text-sm text-slate-600">
                  Delete this book and its reviews?
                </span>
                <Button variant="danger" disabled={deleting} onClick={onDelete}>
                  {deleting ? "Deleting…" : "Yes, delete"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setConfirmDelete(false)}
                >
                  Cancel
                </Button>
              </span>
            ) : (
              <Button variant="danger" onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
            )}
          </div>
        )}

        {error && (
          <div className="mt-4">
            <Alert message={error} />
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900">
          Reviews ({reviews.length})
        </h2>

        {session && !alreadyReviewed && (
          <ReviewForm bookId={bookId} onAdded={load} />
        )}
        {session && alreadyReviewed && (
          <p className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
            You have already reviewed this book.
          </p>
        )}
        {!session && (
          <p className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
            Want to add a review?{" "}
            <button
              type="button"
              onClick={() => navigate("/login")}
              className="font-medium text-indigo-600 hover:underline"
            >
              Sign in
            </button>
            .
          </p>
        )}

        {reviews.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-slate-500">
            No reviews yet. Be the first to review this book.
          </p>
        ) : (
          <ul className="space-y-3">
            {reviews.map((review) => (
              <li
                key={review.id}
                className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-slate-800">
                    {review.username}
                  </span>
                  <span className="text-xs text-slate-400">
                    {formatDate(review.created_at)}
                  </span>
                </div>
                <div className="mt-1 text-sm">
                  <Stars rating={review.rating} />
                  <span className="ml-2 text-slate-500">
                    {review.rating}/5
                  </span>
                </div>
                {review.comment && (
                  <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">
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

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </dt>
      <dd className="mt-1 text-slate-700">{value}</dd>
    </div>
  );
}

function ReviewForm({
  bookId,
  onAdded,
}: {
  bookId: number;
  onAdded: () => void;
}) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setErrors({});
    setMessage("");
    setBusy(true);
    try {
      await api.createReview(bookId, Number(rating), comment);
      setComment("");
      setRating(5);
      onAdded();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.errors);
        setMessage(err.message);
      } else {
        setMessage("Could not submit your review.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
    >
      <h3 className="font-semibold text-slate-800">Write a review</h3>
      {message && <Alert message={message} />}
      <Field label="Rating" name="rating" error={errors.rating}>
        <select
          id="rating"
          value={rating}
          onChange={(e) => setRating(Number(e.target.value))}
          className="w-40 rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n} {n === 1 ? "star" : "stars"}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Comment (optional)" name="comment" error={errors.comment}>
        <textarea
          id="comment"
          rows={3}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="What did you think?"
          className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </Field>
      <Button type="submit" disabled={busy}>
        {busy ? "Submitting…" : "Submit review"}
      </Button>
    </form>
  );
}

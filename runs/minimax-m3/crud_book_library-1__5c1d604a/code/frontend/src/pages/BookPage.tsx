import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { ApiError, api, errorMessage, formatDateTime } from "../api";
import type { Book, Review } from "../api";
import { useAuth } from "../auth";
import { Link, navigate } from "../router";
import { Alert, RatingStars, SelectField, Spinner, TextAreaField } from "../components/ui";

export default function BookPage({ bookId }: { bookId: number }) {
  const { user } = useAuth();
  const [book, setBook] = useState<Book | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [rating, setRating] = useState("5");
  const [comment, setComment] = useState("");
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewFieldErrors, setReviewFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [bookResult, reviewResult] = await Promise.all([
        api.getBook(bookId),
        api.listReviews(bookId),
      ]);
      setBook(bookResult);
      setReviews(reviewResult.items);
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [bookId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setReviewError(null);
    setReviewFieldErrors({});
    setSubmitting(true);
    try {
      await api.createReview(bookId, { rating: Number(rating), comment });
      setComment("");
      setRating("5");
      setNotice("Thanks — your review was added.");
      await load();
    } catch (caught) {
      if (caught instanceof ApiError) {
        setReviewError(caught.message);
        setReviewFieldErrors(caught.errors);
      } else {
        setReviewError("Could not save your review.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!book) return;
    const confirmed = window.confirm(
      `Delete "${book.title}"${book.review_count > 0 ? ` and its ${book.review_count} review(s)` : ""}?`,
    );
    if (!confirmed) return;
    try {
      await api.deleteBook(book.id);
      navigate("/");
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading book…" />
      </div>
    );
  }

  if (error || !book) {
    return (
      <div className="space-y-4">
        <Alert tone="error">{error ?? "Book not found."}</Alert>
        <Link to="/" className="text-sm font-semibold text-indigo-700 hover:text-indigo-900">
          ← Back to books
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <Link to="/" className="text-sm font-semibold text-indigo-700 transition hover:text-indigo-900">
          ← Back to books
        </Link>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{book.title}</h1>
            <p className="mt-1 text-slate-600">by {book.author}</p>
            <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
              <div>
                <dt className="text-slate-500">Year</dt>
                <dd className="font-semibold text-slate-800">{book.year ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">ISBN</dt>
                <dd className="font-semibold text-slate-800">{book.isbn ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Reviews</dt>
                <dd className="font-semibold text-slate-800">{book.review_count}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Average rating</dt>
                <dd>
                  <RatingStars value={book.average_rating} />
                </dd>
              </div>
            </dl>
          </div>
          {user ? (
            <div className="flex gap-3">
              <Link
                to={`/books/${book.id}/edit`}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Edit
              </Link>
              <button
                type="button"
                onClick={() => void handleDelete()}
                className="rounded-md border border-rose-300 bg-white px-3 py-1.5 text-sm font-semibold text-rose-600 transition hover:bg-rose-50"
              >
                Delete
              </button>
            </div>
          ) : null}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-bold tracking-tight text-slate-900">
          Reviews{" "}
          <span className="text-sm font-medium text-slate-500">({reviews.length})</span>
        </h2>

        {notice ? <Alert tone="success">{notice}</Alert> : null}

        {user ? (
          <form
            onSubmit={handleReview}
            className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <h3 className="text-sm font-semibold text-slate-900">Leave a review</h3>
            <SelectField
              id="rating"
              label="Rating"
              value={rating}
              onChange={(event) => setRating(event.target.value)}
              error={reviewFieldErrors.rating}
              className="max-w-xs"
            >
              {[5, 4, 3, 2, 1].map((value) => (
                <option key={value} value={value}>
                  {value} — {value === 5 ? "Excellent" : value === 4 ? "Good" : value === 3 ? "Okay" : value === 2 ? "Poor" : "Terrible"}
                </option>
              ))}
            </SelectField>
            <TextAreaField
              id="comment"
              label="Comment"
              rows={3}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              error={reviewFieldErrors.comment}
              placeholder="What did you think of it?"
            />
            {reviewError ? <Alert tone="error">{reviewError}</Alert> : null}
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Saving…" : "Post review"}
            </button>
          </form>
        ) : (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-3 text-sm text-slate-500">
            Sign in to leave a review.
          </p>
        )}

        {reviews.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
            No reviews yet.
          </p>
        ) : (
          <ul className="space-y-3">
            {reviews.map((review) => (
              <li
                key={review.id}
                className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-900">{review.username}</span>
                  <span className="text-xs text-slate-500">{formatDateTime(review.created_at)}</span>
                </div>
                <div className="mt-1">
                  <RatingStars value={review.rating} showValue={false} />
                </div>
                {review.comment ? (
                  <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{review.comment}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

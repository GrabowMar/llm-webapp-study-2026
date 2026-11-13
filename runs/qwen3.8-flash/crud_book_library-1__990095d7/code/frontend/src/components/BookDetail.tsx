import { useCallback, useEffect, useState } from "react";
import { ApiError, createReview, getBook, listReviews } from "../api";
import type { Book, Review } from "../api";
import { ErrorBanner, Stars, btnPrimary, btnSecondary, cardCls, formatDate, inputCls, labelCls } from "../ui";
import { navigate } from "../router";

interface Props {
  bookId: number;
  authed: boolean;
  username: string | null;
  onChanged: () => void;
}

export default function BookDetail({ bookId, authed, username, onChanged }: Props) {
  const [book, setBook] = useState<Book | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewOk, setReviewOk] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    setError(null);
    Promise.all([getBook(bookId), listReviews(bookId)])
      .then(([b, r]) => {
        setBook(b);
        setReviews(r.items);
        setNotFound(false);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) setNotFound(true);
        else setError(err instanceof ApiError ? err.message : "Failed to load book.");
      });
  }, [bookId]);

  useEffect(() => {
    setBook(null);
    setReviewOk(null);
    setReviewError(null);
    load();
  }, [load]);

  async function submitReview(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setReviewError(null);
    setReviewOk(null);
    try {
      await createReview(bookId, rating, comment);
      setComment("");
      setRating(5);
      setReviewOk("Thanks! Your review was added.");
      load();
      onChanged();
    } catch (err) {
      setReviewError(err instanceof ApiError ? err.message : "Could not save review.");
    } finally {
      setSubmitting(false);
    }
  }

  if (notFound) {
    return (
      <div className="space-y-4">
        <p className="text-slate-600">Book not found.</p>
        <button className={btnSecondary} onClick={() => navigate("/")}>
          ← Back to books
        </button>
      </div>
    );
  }

  if (!book) {
    return <p className="py-10 text-center text-slate-400">Loading…</p>;
  }

  const myReview = username ? reviews.find((r) => r.username === username) : undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <button className="mb-2 text-sm text-indigo-600 hover:underline" onClick={() => navigate("/")}>
            ← All books
          </button>
          <h1 className="text-2xl font-bold text-slate-900">{book.title}</h1>
          <p className="mt-1 text-slate-600">
            {book.author}
            {book.year !== null && <span> · {book.year}</span>}
            {book.isbn && <span> · ISBN {book.isbn}</span>}
          </p>
          <p className="mt-2 flex items-center gap-2 text-sm text-slate-500">
            <Stars value={book.average_rating} />
            <span>· {book.review_count} review{book.review_count === 1 ? "" : "s"}</span>
          </p>
        </div>
        {authed && (
          <div className="flex gap-2">
            <a href={`#/books/${book.id}/edit`} className={btnSecondary}>Edit</a>
          </div>
        )}
      </div>

      <ErrorBanner message={error} />

      {authed && !myReview && (
        <form onSubmit={submitReview} className={cardCls + " space-y-4"}>
          <h2 className="text-lg font-semibold text-slate-900">Write a review</h2>
          <div>
            <label className={labelCls}>Rating</label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <label
                  key={n}
                  className={`flex cursor-pointer items-center gap-1 rounded-md border px-3 py-1.5 text-sm transition ${
                    rating === n
                      ? "border-amber-400 bg-amber-50 font-semibold text-amber-700"
                      : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="rating"
                    value={n}
                    checked={rating === n}
                    onChange={() => setRating(n)}
                    className="sr-only"
                  />
                  {n} ★
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className={labelCls} htmlFor="comment">Comment (optional)</label>
            <textarea
              id="comment"
              rows={3}
              className={inputCls}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="What did you think of this book?"
            />
          </div>
          <ErrorBanner message={reviewError} />
          {reviewOk && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {reviewOk}
            </div>
          )}
          <button type="submit" className={btnPrimary} disabled={submitting}>
            {submitting ? "Saving…" : "Submit review"}
          </button>
        </form>
      )}

      {authed && myReview && (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          You have already reviewed this book ({myReview.rating} ★).
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">
          Reviews {reviews.length > 0 && <span className="text-slate-400">({reviews.length})</span>}
        </h2>
        {reviews.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-400">
            No reviews yet.
          </p>
        ) : (
          <ul className="space-y-3">
            {reviews.map((r) => (
              <li key={r.id} className={cardCls + " p-4!"}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700">
                      {r.username.charAt(0).toUpperCase()}
                    </span>
                    <span className="font-medium text-slate-900">{r.username}</span>
                    <Stars value={r.rating} />
                  </div>
                  <span className="text-xs text-slate-400">{formatDate(r.created_at)}</span>
                </div>
                {r.comment && <p className="mt-2 text-sm text-slate-600">{r.comment}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

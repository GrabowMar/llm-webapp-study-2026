import { useCallback, useEffect, useState } from "react";

import { createReview, deleteBook, getBook, listReviews } from "../api";
import {
  ErrorBox,
  Field,
  Notice,
  Rating,
  dangerButtonClass,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "../components/ui";
import { formatDate, formatDateTime } from "../format";
import type { Auth, Route } from "../route";
import type { Book, Review } from "../types";

export default function BookDetail({
  bookId,
  auth,
  navigate,
}: {
  bookId: number;
  auth: Auth | null;
  navigate: (route: Route) => void;
}) {
  const [book, setBook] = useState<Book | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [rating, setRating] = useState("5");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(() => {
    getBook(bookId)
      .then((b) => setBook(b))
      .catch((err: unknown) =>
        setLoadError(err instanceof Error ? err.message : "Failed to load book"),
      );
    listReviews(bookId)
      .then((r) => setReviews(r.items))
      .catch((err: unknown) =>
        setLoadError(err instanceof Error ? err.message : "Failed to load reviews"),
      );
  }, [bookId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const alreadyReviewed =
    auth !== null && reviews.some((r) => r.username === auth.username);

  async function handleDelete() {
    if (!window.confirm("Delete this book and all of its reviews?")) return;
    try {
      await deleteBook(bookId);
      navigate({ name: "list" });
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to delete book");
    }
  }

  async function handleReview(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await createReview(bookId, {
        rating: Number(rating),
        comment: comment.trim() || undefined,
      });
      setComment("");
      setRating("5");
      setNotice("Your review was added.");
      refresh();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to add review");
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError && !book) {
    return <ErrorBox message={loadError} />;
  }
  if (!book) {
    return <p className="text-slate-500">Loading…</p>;
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{book.title}</h1>
          <p className="text-slate-600">by {book.author}</p>
        </div>
        {auth ? (
          <div className="flex gap-2">
            <button
              className={secondaryButtonClass}
              onClick={() => navigate({ name: "edit", id: book.id })}
            >
              Edit
            </button>
            <button className={dangerButtonClass} onClick={handleDelete}>
              Delete
            </button>
          </div>
        ) : null}
      </div>

      <div className="mb-6 rounded-lg bg-white p-4 shadow">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-slate-500">Year</dt>
            <dd className="font-medium text-slate-900">{book.year ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-500">ISBN</dt>
            <dd className="font-medium text-slate-900">{book.isbn ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-500">Added</dt>
            <dd className="font-medium text-slate-900">{formatDate(book.created_at)}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-500">Average rating</dt>
            <dd className="font-medium text-slate-900">
              {book.average_rating === null
                ? "No reviews"
                : `${book.average_rating.toFixed(1)} (${book.review_count} ${
                    book.review_count === 1 ? "review" : "reviews"
                  })`}
            </dd>
          </div>
        </dl>
      </div>

      <h2 className="mb-3 text-xl font-semibold text-slate-900">Reviews</h2>
      <ErrorBox message={formError} />
      <Notice message={notice} />

      {reviews.length === 0 ? (
        <p className="mb-6 text-slate-500">No reviews yet.</p>
      ) : (
        <ul className="mb-6 space-y-3">
          {reviews.map((review) => (
            <li key={review.id} className="rounded-lg bg-white p-4 shadow">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-slate-900">{review.username}</span>
                <span className="text-xs text-slate-500">{formatDateTime(review.created_at)}</span>
              </div>
              <Rating value={review.rating} />
              {review.comment ? (
                <p className="mt-2 whitespace-pre-wrap text-slate-700">{review.comment}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {auth && !alreadyReviewed ? (
        <form className="rounded-lg bg-white p-4 shadow" onSubmit={handleReview}>
          <h3 className="mb-3 text-lg font-semibold text-slate-900">Add your review</h3>
          <Field label="Rating">
            <select
              className={inputClass}
              value={rating}
              onChange={(e) => setRating(e.target.value)}
              aria-label="Rating"
            >
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>
                  {n} — {"★".repeat(n)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Comment">
            <textarea
              className={inputClass}
              rows={3}
              value={comment}
              placeholder="What did you think of the book?"
              onChange={(e) => setComment(e.target.value)}
            />
          </Field>
          <button type="submit" className={primaryButtonClass} disabled={submitting}>
            {submitting ? "Submitting…" : "Submit review"}
          </button>
        </form>
      ) : null}

      {auth && alreadyReviewed ? (
        <p className="text-slate-600">You have already reviewed this book.</p>
      ) : null}
      {!auth ? (
        <p className="text-slate-600">
          <button
            className="font-medium text-indigo-700 hover:underline"
            onClick={() => navigate({ name: "login" })}
          >
            Sign in
          </button>{" "}
          to add a review.
        </p>
      ) : null}
    </div>
  );
}

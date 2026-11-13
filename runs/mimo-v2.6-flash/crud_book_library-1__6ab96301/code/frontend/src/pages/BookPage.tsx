import { FormEvent, useCallback, useEffect, useState } from "react";
import { ApiError, Book, Review, apiFetch } from "../api";

type Props = {
  id: number;
  username: string | null;
  navigate: (path: string) => void;
  onApiError: (err: unknown) => void;
};

export default function BookPage({ id, username, navigate, onApiError }: Props) {
  const [book, setBook] = useState<Book | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [rating, setRating] = useState("5");
  const [comment, setComment] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [formFields, setFormFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    Promise.all([
      apiFetch<Book>(`/api/books/${id}`),
      apiFetch<{ items: Review[] }>(`/api/books/${id}/reviews`),
    ])
      .then(([b, r]) => {
        setBook(b);
        setReviews(r.items);
        setError(null);
        setNotFound(false);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
        } else {
          setError(err instanceof ApiError ? err.message : "Failed to load book.");
        }
      });
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (book && book.title) document.title = `${book.title} · Book Library`;
    return () => {
      document.title = "Book Library";
    };
  }, [book]);

  async function submitReview(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFormError(null);
    setFormFields({});
    try {
      await apiFetch(`/api/books/${id}/reviews`, {
        method: "POST",
        body: { rating: Number(rating), comment },
      });
      setComment("");
      load();
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
        setFormFields(err.fields);
        onApiError(err);
      } else {
        setFormError("Failed to submit review.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function deleteBook() {
    if (!window.confirm("Delete this book and all of its reviews? This cannot be undone.")) {
      return;
    }
    try {
      await apiFetch(`/api/books/${id}`, { method: "DELETE" });
      navigate("/");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        onApiError(err);
      } else {
        setError("Failed to delete book.");
      }
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

  if (error && !book) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      </div>
    );
  }

  if (!book) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center text-gray-500">Loading…</div>
    );
  }

  const alreadyReviewed = reviews.some((r) => r.username === username);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <button
        type="button"
        onClick={() => navigate("/")}
        className="text-sm text-gray-500 hover:text-gray-800"
      >
        ← All books
      </button>

      <div className="mt-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{book.title}</h1>
            <p className="mt-1 text-gray-700">{book.author}</p>
          </div>
          {username && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => navigate(`/books/${book.id}/edit`)}
                className="rounded border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={deleteBook}
                className="rounded border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
              >
                Delete
              </button>
            </div>
          )}
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-gray-500">Year</dt>
            <dd className="font-medium">{book.year ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-gray-500">ISBN</dt>
            <dd className="font-medium">{book.isbn ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Rating</dt>
            <dd className="font-medium">
              {book.average_rating === null
                ? "No reviews"
                : `${book.average_rating.toFixed(1)} / 5`}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Reviews</dt>
            <dd className="font-medium">{book.review_count}</dd>
          </div>
        </dl>
        {error && (
          <p className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
      </div>

      <section className="mt-6">
        <h2 className="text-lg font-semibold">Reviews</h2>

        {username ? (
          alreadyReviewed ? (
            <p className="mt-3 rounded border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600">
              You have already reviewed this book.
            </p>
          ) : (
            <form
              onSubmit={submitReview}
              className="mt-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
            >
              <h3 className="text-sm font-medium text-gray-700">Write a review</h3>
              {formError && (
                <p className="mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {formError}
                </p>
              )}
              <div className="mt-3 flex items-center gap-3">
                <label htmlFor="rating" className="text-sm font-medium text-gray-700">
                  Rating
                </label>
                <select
                  id="rating"
                  value={rating}
                  onChange={(e) => setRating(e.target.value)}
                  className="rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  {[5, 4, 3, 2, 1].map((n) => (
                    <option key={n} value={n}>
                      {n} / 5
                    </option>
                  ))}
                </select>
                {formFields.rating && (
                  <span className="text-sm text-red-600">{formFields.rating}</span>
                )}
              </div>
              <div className="mt-3">
                <label htmlFor="comment" className="block text-sm font-medium text-gray-700">
                  Comment
                </label>
                <textarea
                  id="comment"
                  rows={3}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="What did you think?"
                  className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                {formFields.comment && (
                  <p className="mt-1 text-sm text-red-600">{formFields.comment}</p>
                )}
              </div>
              <button
                type="submit"
                disabled={busy}
                className="mt-3 rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {busy ? "Submitting…" : "Submit review"}
              </button>
            </form>
          )
        ) : (
          <p className="mt-3 text-sm text-gray-600">
            <button
              type="button"
              onClick={() => navigate("/login")}
              className="font-medium text-indigo-600 hover:underline"
            >
              Sign in
            </button>{" "}
            to review this book.
          </p>
        )}

        <ul className="mt-4 space-y-3">
          {reviews.length === 0 ? (
            <li className="rounded border border-gray-200 bg-white px-4 py-6 text-center text-sm text-gray-500">
              No reviews yet.
            </li>
          ) : (
            reviews.map((review) => (
              <li
                key={review.id}
                className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="font-medium text-gray-900">{review.username}</span>
                  <span className="text-gray-500">
                    {new Date(review.created_at).toLocaleDateString()}
                  </span>
                </div>
                <div className="mt-1 text-sm font-medium text-amber-600">
                  {review.rating} / 5
                </div>
                {review.comment && (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">
                    {review.comment}
                  </p>
                )}
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}

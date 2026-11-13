import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError, type Book, type Review } from "./api";
import { Link, navigate } from "./router";
import { btn, btnDanger, btnSecondary, ErrorMessage, Field, formatDate, input, Rating } from "./ui";

export function BookPage({ id, signedIn }: { id: number; signedIn: boolean }) {
  const [book, setBook] = useState<Book | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [error, setError] = useState("");
  const [rating, setRating] = useState("5");
  const [comment, setComment] = useState("");
  const [formError, setFormError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const [b, r] = await Promise.all([api.getBook(id), api.listReviews(id)]);
      setBook(b);
      setReviews(r.items);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    setBook(null);
    setError("");
    load();
  }, [id]);

  async function submitReview(e: FormEvent) {
    e.preventDefault();
    setFormError("");
    setFields({});
    setBusy(true);
    try {
      await api.addReview(id, Number(rating), comment);
      setComment("");
      await load();
    } catch (err) {
      if (err instanceof ApiError) {
        setFields(err.fields);
        setFormError(Object.keys(err.fields).length ? "" : err.message);
      } else {
        setFormError("Network error");
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    try {
      await api.deleteBook(id);
      navigate("/");
    } catch (e) {
      setError((e as Error).message);
      setConfirming(false);
    }
  }

  if (error && !book) return <ErrorMessage>{error}</ErrorMessage>;
  if (!book) return <p>Loading...</p>;

  return (
    <div className="space-y-6">
      <Link to="/" className="text-sm text-indigo-600 hover:underline">
        &larr; All books
      </Link>
      <ErrorMessage>{error}</ErrorMessage>
      <section className="space-y-2 rounded bg-white p-6 shadow">
        <h1 className="text-2xl font-semibold">{book.title}</h1>
        <p className="text-slate-600">by {book.author}</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 text-sm">
          <dt className="text-slate-500">Year</dt>
          <dd>{book.year ?? "-"}</dd>
          <dt className="text-slate-500">ISBN</dt>
          <dd>{book.isbn ?? "-"}</dd>
          <dt className="text-slate-500">Rating</dt>
          <dd>
            <Rating value={book.average_rating} /> ({book.review_count} review
            {book.review_count === 1 ? "" : "s"})
          </dd>
        </dl>
        {signedIn && (
          <div className="flex items-center gap-2 pt-2">
            <Link to={`/books/${book.id}/edit`} className={btnSecondary}>
              Edit
            </Link>
            {confirming ? (
              <>
                <span className="text-sm">Delete this book and its reviews?</span>
                <button className={btnDanger} onClick={remove}>
                  Confirm delete
                </button>
                <button className={btnSecondary} onClick={() => setConfirming(false)}>
                  Cancel
                </button>
              </>
            ) : (
              <button className={btnDanger} onClick={() => setConfirming(true)}>
                Delete
              </button>
            )}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Reviews</h2>
        {reviews.length === 0 && <p className="text-slate-500">No reviews yet.</p>}
        <ul className="space-y-3">
          {reviews.map((r) => (
            <li key={r.id} className="rounded bg-white p-4 shadow">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{r.username}</span>
                <span className="text-slate-500">{formatDate(r.created_at)}</span>
              </div>
              <p className="text-sm">Rating: {r.rating} / 5</p>
              {r.comment && <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{r.comment}</p>}
            </li>
          ))}
        </ul>
      </section>

      {signedIn ? (
        <form onSubmit={submitReview} className="space-y-3 rounded bg-white p-6 shadow">
          <h2 className="text-lg font-semibold">Your review</h2>
          <ErrorMessage>{formError}</ErrorMessage>
          <Field label="Rating" error={fields.rating}>
            <select className={input} value={rating} onChange={(e) => setRating(e.target.value)}>
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Comment" error={fields.comment}>
            <textarea
              className={input}
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </Field>
          <button className={btn} disabled={busy}>
            Submit review
          </button>
        </form>
      ) : (
        <p className="text-sm text-slate-600">
          <Link to="/login" className="text-indigo-600 hover:underline">
            Sign in
          </Link>{" "}
          to review this book.
        </p>
      )}
    </div>
  );
}

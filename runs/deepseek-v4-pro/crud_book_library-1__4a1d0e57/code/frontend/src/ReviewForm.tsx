import { FormEvent, useState } from "react";
import { ApiError, Review, apiCreateReview } from "./api";

interface Props {
  bookId: number;
  onCreated: (review: Review) => void;
}

export default function ReviewForm({ bookId, onCreated }: Props) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setGlobalError(null);
    setLoading(true);
    try {
      const review = await apiCreateReview(bookId, { rating, comment });
      setComment("");
      setRating(5);
      onCreated(review);
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
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="font-semibold text-slate-900">Leave a review</h2>
      {globalError && !Object.keys(errors).length && (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{globalError}</p>
      )}
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Rating</label>
        <select
          value={rating}
          onChange={(e) => setRating(Number(e.target.value))}
          className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        >
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>
              {n} star{n === 1 ? "" : "s"}
            </option>
          ))}
        </select>
        {errors.rating && <p className="mt-1 text-sm text-red-600">{errors.rating}</p>}
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Comment</label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        />
        {errors.comment && <p className="mt-1 text-sm text-red-600">{errors.comment}</p>}
      </div>
      <button
        type="submit"
        disabled={loading}
        className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {loading ? "Submitting…" : "Submit review"}
      </button>
    </form>
  );
}

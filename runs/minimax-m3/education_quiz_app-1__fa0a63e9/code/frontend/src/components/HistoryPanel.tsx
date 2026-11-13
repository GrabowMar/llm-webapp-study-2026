import { useCallback, useEffect, useState } from "react";
import { ApiError, apiRequest } from "@/api";
import type { Attempt } from "@/types";
import AttemptReview from "./AttemptReview";

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function HistoryPanel() {
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [selected, setSelected] = useState<Attempt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await apiRequest<{ items: Attempt[] }>("/api/attempts");
      setAttempts(result.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load your attempts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const open = async (id: number) => {
    setError("");
    try {
      const attempt = await apiRequest<Attempt>(`/api/attempts/${id}`);
      setSelected(attempt);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load that attempt.");
    }
  };

  if (selected) {
    return (
      <section className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Attempt review</h2>
            <p className="mt-1 text-sm text-slate-500">
              {formatDate(selected.submitted_at)} · {selected.correct} of{" "}
              {selected.total_questions} correct
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Back to history
          </button>
        </div>
        <AttemptReview attempt={selected} />
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Your attempts</h2>
          <p className="mt-1 text-sm text-slate-500">
            Every quiz you have saved, newest first.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Loading your attempts...</p>
      ) : attempts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <p className="font-medium text-slate-700">No attempts yet</p>
          <p className="mt-1 text-sm text-slate-500">
            Play a quiz and your results will show up here.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {attempts.map((attempt) => (
            <li key={attempt.id}>
              <button
                type="button"
                onClick={() => void open(attempt.id)}
                className="flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-indigo-300 hover:bg-indigo-50/40"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {formatDate(attempt.submitted_at)}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {attempt.total_questions} questions
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold text-slate-900">
                    {Math.round(attempt.score)}%
                  </span>
                  <span className="text-sm text-slate-500">
                    {attempt.correct}/{attempt.total_questions} correct
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

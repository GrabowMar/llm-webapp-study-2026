import { useEffect, useState } from "react";
import { ApiError, fetchAttempt, fetchAttempts } from "../api";
import { formatDate, formatScore } from "../format";
import type { Attempt } from "../types";
import ReviewList from "./ReviewList";

interface AttemptsProps {
  onOpen: (id: number) => void;
}

export function Attempts({ onOpen }: AttemptsProps) {
  const [items, setItems] = useState<Attempt[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAttempts()
      .then((data) => {
        if (!cancelled) {
          setItems(data.items);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Could not load your attempts.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold text-slate-900">My attempts</h1>
      <p className="mt-1 text-slate-600">Your saved quiz attempts, newest first.</p>

      {error ? (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
          {error}
        </div>
      ) : null}

      {items && items.length === 0 ? (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 text-center text-slate-600 shadow-sm">
          No attempts yet. Take a quiz to get started!
        </div>
      ) : null}

      {items && items.length > 0 ? (
        <ul className="mt-6 space-y-3">
          {items.map((attempt, index) => (
            <li key={attempt.id ?? index}>
              <button
                type="button"
                onClick={() => {
                  if (attempt.id !== null) {
                    onOpen(attempt.id);
                  }
                }}
                className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-5 py-4 text-left shadow-sm hover:border-indigo-300 hover:bg-indigo-50"
              >
                <div>
                  <p className="font-medium text-slate-900">{formatDate(attempt.submitted_at)}</p>
                  <p className="text-sm text-slate-600">
                    {attempt.total_questions} question{attempt.total_questions === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold text-indigo-600">{formatScore(attempt.score)}</p>
                  <p className="text-sm text-slate-600">
                    {attempt.correct} of {attempt.total_questions} correct
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {!items && !error ? <p className="mt-6 text-slate-600">Loading…</p> : null}
    </div>
  );
}

interface AttemptDetailProps {
  id: number;
  onBack: () => void;
}

export function AttemptDetail({ id, onBack }: AttemptDetailProps) {
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setAttempt(null);
    setError(null);
    fetchAttempt(id)
      .then((data) => {
        if (!cancelled) {
          setAttempt(data);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Could not load this attempt.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return (
      <div className="mx-auto max-w-2xl">
        <button
          type="button"
          onClick={onBack}
          className="text-sm font-medium text-slate-500 hover:text-slate-800"
        >
          &larr; My attempts
        </button>
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
          {error}
        </div>
      </div>
    );
  }

  if (!attempt) {
    return <p className="text-center text-slate-600">Loading…</p>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="text-sm font-medium text-slate-500 hover:text-slate-800"
      >
        &larr; My attempts
      </button>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Attempt review</h1>
        <p className="mt-1 text-sm text-slate-500">Submitted {formatDate(attempt.submitted_at)}</p>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <div className="rounded-lg bg-indigo-50 px-4 py-2">
            <p className="text-xs font-medium uppercase tracking-wide text-indigo-700">Score</p>
            <p className="text-xl font-bold text-indigo-700">{formatScore(attempt.score)}</p>
          </div>
          <div className="rounded-lg bg-slate-100 px-4 py-2">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-600">Correct</p>
            <p className="text-xl font-bold text-slate-800">
              {attempt.correct} of {attempt.total_questions}
            </p>
          </div>
        </div>
      </div>

      <ReviewList answers={attempt.answers} />
    </div>
  );
}

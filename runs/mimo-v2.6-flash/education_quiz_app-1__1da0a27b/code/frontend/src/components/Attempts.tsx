import { useEffect, useState } from "react";
import { api, errorMessage } from "../api";
import type { Attempt } from "../types";

interface AttemptsProps {
  onOpen: (id: number) => void;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

export default function Attempts({ onOpen }: AttemptsProps) {
  const [items, setItems] = useState<Attempt[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<{ items: Attempt[] }>("/api/attempts")
      .then((data) => {
        if (!cancelled) {
          setItems(data.items);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(errorMessage(err));
          setItems([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (items === null) {
    return <p className="text-sm text-slate-500">Loading attempts…</p>;
  }

  return (
    <section>
      <h1 className="mb-4 text-2xl font-bold text-slate-900">Your attempts</h1>
      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {!error && items.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-slate-500">
          No saved attempts yet. Take a quiz to see your results here.
        </p>
      )}
      {items.length > 0 && (
        <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {items.map((attempt) => (
            <li key={attempt.id ?? `${attempt.submitted_at}-${attempt.correct}`}>
              <button
                type="button"
                onClick={() => attempt.id !== null && onOpen(attempt.id)}
                className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50"
              >
                <span className="text-sm text-slate-600">
                  {formatDate(attempt.submitted_at)}
                </span>
                <span className="flex items-center gap-4 text-sm">
                  <span className="font-semibold text-indigo-600">Score: {attempt.score}%</span>
                  <span className="text-slate-700">
                    {attempt.correct} of {attempt.total_questions} correct
                  </span>
                  <span className="text-slate-500">
                    {attempt.total_questions} question{attempt.total_questions === 1 ? "" : "s"}
                  </span>
                  <span className="text-indigo-600">View</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

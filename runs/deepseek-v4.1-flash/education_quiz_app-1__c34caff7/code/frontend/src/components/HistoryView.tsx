import { useEffect, useState } from "react";
import { api } from "../api";
import type { Attempt } from "../types";

interface Props {
  onOpenAttempt: (attempt: Attempt) => void;
  refreshKey: number;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function HistoryView({ onOpenAttempt, refreshKey }: Props) {
  const [attempts, setAttempts] = useState<Attempt[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api<{ items: Attempt[] }>("/api/attempts")
      .then((data) => {
        if (active) {
          setAttempts(data.items);
        }
      })
      .catch((err: Error) => {
        if (active) {
          setError(err.message);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [refreshKey]);

  if (loading) {
    return <p className="py-16 text-center text-slate-500">Loading attempts…</p>;
  }

  if (error) {
    return (
      <div className="rounded-xl bg-rose-50 px-4 py-3 text-rose-700">{error}</div>
    );
  }

  if (!attempts || attempts.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
        <p className="text-lg font-semibold text-slate-800">No attempts yet</p>
        <p className="mt-1 text-slate-500">
          Finish a quiz while signed in and it will show up here.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-left">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-5 py-3 font-semibold">Date</th>
            <th className="px-5 py-3 font-semibold">Score</th>
            <th className="px-5 py-3 font-semibold">Questions</th>
            <th className="px-5 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {attempts.map((attempt) => (
            <tr
              key={attempt.id ?? `${attempt.submitted_at}-${attempt.score}`}
              className="transition hover:bg-slate-50"
            >
              <td className="px-5 py-3 text-sm text-slate-700">
                {formatDate(attempt.submitted_at)}
              </td>
              <td className="px-5 py-3">
                <span className="font-semibold text-slate-900">
                  {attempt.score}%
                </span>
                <span className="ml-2 text-sm text-slate-500">
                  ({attempt.correct}/{attempt.total_questions})
                </span>
              </td>
              <td className="px-5 py-3 text-sm text-slate-600">
                {attempt.total_questions}
              </td>
              <td className="px-5 py-3 text-right">
                <button
                  type="button"
                  onClick={() => onOpenAttempt(attempt)}
                  className="rounded-lg border border-indigo-200 px-3 py-1.5 text-sm font-semibold text-indigo-600 transition hover:bg-indigo-50"
                >
                  Review
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

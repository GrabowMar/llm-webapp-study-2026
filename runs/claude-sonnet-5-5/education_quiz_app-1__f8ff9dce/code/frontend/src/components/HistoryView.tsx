import { useEffect, useState } from "react";
import { ApiError, Attempt, api } from "../api";
import { btnSecondary, cardCls, formatDate } from "../ui";
import ResultView from "./ResultView";

export default function HistoryView({ onExpired }: { onExpired: () => void }) {
  const [items, setItems] = useState<Attempt[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Attempt | null>(null);

  useEffect(() => {
    api<{ items: Attempt[] }>("/attempts")
      .then((d) => setItems(d.items))
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) onExpired();
        else setError(e.message);
      });
  }, [onExpired]);

  const openAttempt = async (id: number) => {
    try {
      setOpen(await api<Attempt>(`/attempts/${id}`));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) onExpired();
      else setError(e instanceof Error ? e.message : "Something went wrong");
    }
  };

  if (open) return <ResultView attempt={open} onBack={() => setOpen(null)} />;
  if (error) return <p role="alert" className="text-red-600">{error}</p>;
  if (!items) return <p className="text-slate-500">Loading…</p>;

  return (
    <section className={cardCls}>
      <h2 className="mb-4 text-xl font-bold">My attempts</h2>
      {items.length === 0 ? (
        <p className="text-slate-600">No saved attempts yet.</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="py-2">Date</th>
              <th>Score</th>
              <th>Questions</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((a) => (
              <tr key={a.id} className="border-b border-slate-100">
                <td className="py-2">{formatDate(a.submitted_at)}</td>
                <td>
                  {a.score}% ({a.correct}/{a.total_questions})
                </td>
                <td>{a.total_questions}</td>
                <td className="text-right">
                  <button className={btnSecondary} onClick={() => openAttempt(a.id!)}>
                    Open
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

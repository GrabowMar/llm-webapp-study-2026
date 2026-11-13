import { useEffect, useState } from "react";
import { ApiError, api, type Attempt } from "../api";
import Result, { formatDate } from "./Result";

interface Props {
  onUnauthorized: () => void;
}

export default function History({ onUnauthorized }: Props) {
  const [items, setItems] = useState<Attempt[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Attempt | null>(null);

  useEffect(() => {
    api
      .attempts()
      .then((res) => setItems(res.items))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) onUnauthorized();
        else setError(err instanceof ApiError ? err.message : "Could not load attempts");
      });
  }, [onUnauthorized]);

  async function openAttempt(id: number) {
    setError(null);
    try {
      setOpen(await api.attempt(id));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) onUnauthorized();
      else setError(err instanceof ApiError ? err.message : "Could not load attempt");
    }
  }

  if (open) {
    return <Result attempt={open} signedIn onBack={() => setOpen(null)} />;
  }

  return (
    <div className="mx-auto max-w-2xl rounded-xl bg-white p-6 shadow">
      <h2 className="mb-4 text-xl font-semibold">My attempts</h2>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      {items === null && !error && <p className="text-slate-500">Loading…</p>}
      {items && items.length === 0 && (
        <p className="text-slate-500">No saved attempts yet. Take a quiz!</p>
      )}
      {items && items.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              <th className="py-2 font-medium">Date</th>
              <th className="py-2 font-medium">Score</th>
              <th className="py-2 font-medium">Questions</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {items.map((a) => (
              <tr key={a.id} className="border-b border-slate-100 last:border-0">
                <td className="py-2">{formatDate(a.submitted_at)}</td>
                <td className="py-2 font-medium">
                  {a.score}% ({a.correct}/{a.total_questions})
                </td>
                <td className="py-2">{a.total_questions}</td>
                <td className="py-2 text-right">
                  <button
                    type="button"
                    className="font-medium text-indigo-600 hover:underline"
                    onClick={() => a.id !== null && openAttempt(a.id)}
                  >
                    Review
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

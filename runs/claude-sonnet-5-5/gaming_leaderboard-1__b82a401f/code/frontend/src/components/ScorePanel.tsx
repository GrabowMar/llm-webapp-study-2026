import { useCallback, useEffect, useState } from "react";
import { api, ApiError, formatDate, Score, SubmittedScore } from "../api";

export default function ScorePanel({
  refreshKey,
  onSubmitted,
}: {
  refreshKey: number;
  onSubmitted: () => void;
}) {
  const [value, setValue] = useState("");
  const [result, setResult] = useState<SubmittedScore | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<Score[]>([]);
  const [best, setBest] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<{ items: Score[]; best_score: number | null }>("/scores");
      setItems(res.items);
      setBest(res.best_score);
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!/^\d+$/.test(value.trim())) {
      setError("Enter a whole number of 0 or more");
      return;
    }
    setBusy(true);
    try {
      const res = await api<SubmittedScore>("/scores", {
        method: "POST",
        body: { score: Number(value.trim()) },
      });
      setResult(res);
      setValue("");
      onSubmitted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4 rounded-lg bg-white p-5 shadow">
      <h2 className="text-lg font-semibold">Submit a score</h2>
      <form onSubmit={submit} className="flex gap-2">
        <input
          aria-label="Score"
          name="score"
          inputMode="numeric"
          placeholder="Score"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="min-w-0 flex-1 rounded border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          Submit
        </button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {result && (
        <div role="status" className="rounded bg-green-50 p-3 text-sm text-green-800">
          <p>
            Score {result.score} submitted. Your rank: <strong>#{result.rank}</strong>
          </p>
          {result.personal_best && <p className="font-semibold">New personal best!</p>}
        </div>
      )}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-600">
          Your best score: <span className="text-slate-900">{best ?? "–"}</span>
        </h3>
        <ul className="divide-y divide-slate-100 text-sm">
          {items.slice(0, 10).map((s) => (
            <li key={s.id} className="flex justify-between py-1.5">
              <span className="tabular-nums">
                {s.score}
                {s.is_hidden && (
                  <span className="ml-2 rounded bg-slate-200 px-1.5 text-xs text-slate-600">
                    hidden
                  </span>
                )}
              </span>
              <span className="text-slate-500">{formatDate(s.achieved_at)}</span>
            </li>
          ))}
          {items.length === 0 && <li className="py-2 text-slate-400">No submissions yet.</li>}
        </ul>
      </div>
    </section>
  );
}

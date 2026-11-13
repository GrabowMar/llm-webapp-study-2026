import { useState, type FormEvent } from "react";
import { api, ApiError, formatDate, formatScore, type Score, type SubmittedScore } from "../api";

interface Props {
  scores: Score[];
  bestScore: number | null;
  onSubmitted: () => void;
  onUnauthorized: () => void;
}

export default function PlayerPanel({ scores, bestScore, onSubmitted, onUnauthorized }: Props) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SubmittedScore | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    const n = Number(value);
    if (value.trim() === "" || !Number.isInteger(n) || n < 0) {
      setError("Enter a whole number of 0 or more.");
      return;
    }
    setBusy(true);
    try {
      const res = await api.submitScore(n);
      setResult(res);
      setValue("");
      onSubmitted();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) onUnauthorized();
      setError(err instanceof ApiError ? err.message : "Could not submit score");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-700 bg-slate-800/60 p-5 shadow-lg">
        <h2 className="mb-3 text-lg font-bold text-white">Submit a score</h2>
        <form onSubmit={submit} className="flex gap-2" aria-label="Submit score">
          <input
            name="score"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            required
            placeholder="Your score"
            aria-label="Score"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="min-w-0 flex-1 rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/40"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-emerald-500 px-4 py-2 font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Submit"}
          </button>
        </form>
        {error && (
          <p role="alert" className="mt-3 rounded-md bg-rose-500/15 px-3 py-2 text-sm text-rose-300">
            {error}
          </p>
        )}
        {result && (
          <div role="status" className="mt-3 rounded-md bg-slate-900 px-3 py-2 text-sm text-slate-200">
            <p>
              Saved <span className="font-mono font-semibold">{formatScore(result.score)}</span>
              {result.rank !== null && (
                <>
                  {" "}
                  · your rank: <span className="font-bold text-indigo-300">#{result.rank}</span>
                </>
              )}
            </p>
            {result.personal_best && (
              <p className="mt-1 font-bold text-amber-300">New personal best!</p>
            )}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-700 bg-slate-800/60 p-5 shadow-lg">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-bold text-white">My submissions</h2>
          <p className="text-sm text-slate-400">
            Best:{" "}
            <span className="font-mono font-semibold text-amber-300" data-testid="best-score">
              {bestScore === null ? "—" : formatScore(bestScore)}
            </span>
          </p>
        </div>
        {scores.length === 0 ? (
          <p className="text-sm text-slate-400">No submissions yet.</p>
        ) : (
          <ul className="max-h-80 divide-y divide-slate-700/60 overflow-y-auto">
            {scores.slice(0, 20).map((s) => (
              <li key={s.id} className="flex items-center justify-between py-2 text-sm">
                <span>
                  <span className={`font-mono ${s.is_hidden ? "text-slate-500 line-through" : "text-slate-100"}`}>
                    {formatScore(s.score)}
                  </span>
                  {s.is_hidden && <span className="ml-2 text-xs text-rose-300">(hidden)</span>}
                </span>
                <span className="text-slate-400">{formatDate(s.achieved_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

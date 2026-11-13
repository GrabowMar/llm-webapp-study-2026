import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ApiError, api } from "../api";
import { formatDate, formatScore } from "../format";
import type { MyScoresResponse, SubmittedScore } from "../types";

interface ScorePanelProps {
  token: string;
  onScoreSubmitted: () => void;
  onUnauthorized: () => void;
}

export default function ScorePanel({
  token,
  onScoreSubmitted,
  onUnauthorized,
}: ScorePanelProps) {
  const [scoreInput, setScoreInput] = useState("");
  const [result, setResult] = useState<SubmittedScore | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState<MyScoresResponse | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setMine(await api.myScores(token));
      setListError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onUnauthorized();
        return;
      }
      setListError(err instanceof Error ? err.message : "Failed to load scores");
    }
  }, [token, onUnauthorized]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const value = Number(scoreInput);
    if (!Number.isFinite(value)) {
      setSubmitError("Enter a valid number");
      return;
    }
    setBusy(true);
    setSubmitError(null);
    setResult(null);
    try {
      const submitted = await api.submitScore(token, value);
      setResult(submitted);
      setScoreInput("");
      await reload();
      onScoreSubmitted();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onUnauthorized();
        return;
      }
      setSubmitError(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-2xl bg-white p-6 shadow">
        <h2 className="text-lg font-semibold text-slate-900">Submit a score</h2>
        <p className="mt-1 text-sm text-slate-500">
          Scores are stamped with the server time and ranked instantly.
        </p>
        <form onSubmit={handleSubmit} className="mt-4 flex gap-2">
          <input
            type="number"
            step="any"
            value={scoreInput}
            onChange={(event) => setScoreInput(event.target.value)}
            placeholder="Your score"
            aria-label="Score"
            required
            className="w-40 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          />
          <button
            type="submit"
            disabled={busy}
            className="cursor-pointer rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Submitting…" : "Submit score"}
          </button>
        </form>
        {submitError && (
          <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {submitError}
          </p>
        )}
        {result && (
          <div
            className={`mt-4 rounded-xl border p-4 ${
              result.personal_best
                ? "border-emerald-300 bg-emerald-50"
                : "border-slate-200 bg-slate-50"
            }`}
          >
            <p className="text-sm text-slate-600">Score recorded</p>
            <p className="text-xl font-bold text-slate-900">
              {formatScore(result.score)}
            </p>
            {result.rank !== null && (
              <p className="mt-1 text-sm text-slate-700">
                Your all-time rank:{" "}
                <span className="font-semibold">#{result.rank}</span>
              </p>
            )}
            {result.personal_best && (
              <p className="mt-2 text-lg font-bold text-emerald-600">
                New personal best!
              </p>
            )}
          </div>
        )}
      </div>

      <div className="rounded-2xl bg-white p-6 shadow">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">
            Your submissions
          </h2>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Best score
            </p>
            <p className="text-lg font-bold text-slate-900">
              {mine && mine.best_score !== null
                ? formatScore(mine.best_score)
                : "—"}
            </p>
          </div>
        </div>
        {listError && (
          <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {listError}
          </p>
        )}
        <ul className="mt-4 divide-y divide-slate-100">
          {mine?.items.map((item) => (
            <li key={item.id} className="flex items-center justify-between py-2">
              <div>
                <p className="font-semibold text-slate-900">
                  {formatScore(item.score)}
                  {item.is_hidden && (
                    <span className="ml-2 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">
                      hidden
                    </span>
                  )}
                </p>
                <p className="text-xs text-slate-500">
                  {formatDate(item.achieved_at)}
                </p>
              </div>
            </li>
          ))}
          {mine && mine.items.length === 0 && (
            <li className="py-6 text-center text-sm text-slate-400">
              No submissions yet — post your first score!
            </li>
          )}
        </ul>
      </div>
    </section>
  );
}

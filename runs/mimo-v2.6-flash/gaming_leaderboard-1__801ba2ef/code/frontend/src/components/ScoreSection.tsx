import { useEffect, useState, type FormEvent } from "react";
import {
  ApiError,
  apiGet,
  apiPost,
  formatDate,
  type MyScoresResponse,
  type SubmitResult,
} from "../api";

type Props = {
  signedIn: boolean;
  refreshKey: number;
  onScoreSubmitted: () => void;
};

export default function ScoreSection({
  signedIn,
  refreshKey,
  onScoreSubmitted,
}: Props) {
  const [scoreInput, setScoreInput] = useState("");
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState<MyScoresResponse | null>(null);
  const [mineError, setMineError] = useState<string | null>(null);

  useEffect(() => {
    if (!signedIn) {
      setMine(null);
      setMineError(null);
      setResult(null);
      return;
    }
    let cancelled = false;
    apiGet<MyScoresResponse>("/api/scores")
      .then((data) => {
        if (!cancelled) {
          setMine(data);
          setMineError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setMineError(
            err instanceof Error ? err.message : "Failed to load scores",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn, refreshKey]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const trimmed = scoreInput.trim();
    const value = Number(trimmed);
    if (trimmed === "" || !Number.isFinite(value)) {
      setError("Enter a valid score.");
      return;
    }
    setBusy(true);
    try {
      const created = await apiPost<SubmitResult>("/api/scores", {
        score: value,
      });
      setResult(created);
      setScoreInput("");
      onScoreSubmitted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to submit score");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-base font-semibold text-slate-900">
          Submit a score
        </h2>

        {!signedIn ? (
          <p className="text-sm text-slate-500">
            Sign in to submit scores and track your rank.
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <input
              type="number"
              step="any"
              value={scoreInput}
              onChange={(event) => setScoreInput(event.target.value)}
              placeholder="Your score"
              aria-label="Score"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
            >
              {busy ? "Submitting…" : "Submit score"}
            </button>
          </form>
        )}

        {result && (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">
            <p className="text-slate-700">
              Submitted score{" "}
              <span className="font-bold text-slate-900">{result.score}</span>
              {result.rank !== null && (
                <>
                  {" "}
                  — rank{" "}
                  <span className="font-bold text-slate-900">
                    #{result.rank}
                  </span>
                </>
              )}
              .
            </p>
            {result.personal_best && (
              <p className="mt-1 font-semibold text-emerald-600">
                New personal best!
              </p>
            )}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-base font-semibold text-slate-900">
          Your scores
        </h2>

        {!signedIn ? (
          <p className="text-sm text-slate-500">
            Sign in to see your submissions.
          </p>
        ) : mineError ? (
          <p className="text-sm text-red-700">{mineError}</p>
        ) : !mine ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg bg-slate-50 px-4 py-3 text-center">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Best score
              </p>
              <p className="text-3xl font-bold text-slate-900">
                {mine.best_score ?? "—"}
              </p>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Recent submissions
              </p>
              {mine.items.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No submissions yet — submit your first score above.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {mine.items.map((score) => (
                    <li
                      key={score.id}
                      className="flex items-center justify-between gap-3 py-2 text-sm"
                    >
                      <span className="font-mono font-semibold text-slate-900">
                        {score.score}
                      </span>
                      <span className="text-slate-500">
                        {formatDate(score.achieved_at)}
                      </span>
                      {score.is_hidden && (
                        <span className="rounded bg-slate-200 px-1.5 py-0.5 text-xs font-medium text-slate-600">
                          hidden
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

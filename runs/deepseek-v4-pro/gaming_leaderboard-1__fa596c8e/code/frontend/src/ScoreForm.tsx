import { useState } from "react";
import type { ScoreResult } from "./api";

export default function ScoreForm({
  onSubmit,
}: {
  onSubmit: (result: ScoreResult) => void;
}) {
  const [score, setScore] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ScoreResult | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    const value = Number(score);
    if (score.trim() === "" || !Number.isFinite(value)) {
      setError("Enter a valid number.");
      return;
    }
    setBusy(true);
    try {
      const { submitScore } = await import("./api");
      const res = await submitScore(value);
      setResult(res);
      onSubmit(res);
      setScore("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl bg-white p-4 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-800">Submit score</h2>
      <form onSubmit={submit} className="mt-3 flex gap-2">
        <input
          value={score}
          onChange={(e) => setScore(e.target.value)}
          placeholder="Score"
          inputMode="numeric"
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          Submit
        </button>
      </form>

      {error && (
        <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      )}

      {result && (
        <div className="mt-3 space-y-2 rounded-md bg-slate-50 p-3 text-sm">
          <p className="text-slate-700">
            Score <span className="font-semibold">{result.score}</span> recorded.
            All-time rank:{" "}
            <span className="font-semibold">
              {result.rank == null ? "—" : `#${result.rank}`}
            </span>
          </p>
          {result.personal_best && (
            <p className="font-semibold text-emerald-600">
              New personal best!
            </p>
          )}
        </div>
      )}
    </section>
  );
}

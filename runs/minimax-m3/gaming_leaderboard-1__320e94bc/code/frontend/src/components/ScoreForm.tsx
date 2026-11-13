import { useState } from "react";
import { api } from "../api";
import { errorMessage, formatNumber } from "../lib/format";
import type { SubmittedScore } from "../types";

interface Props {
  onSubmitted: (result: SubmittedScore) => void;
}

export default function ScoreForm({ onSubmitted }: Props) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SubmittedScore | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const parsed = Number(value);
    if (!value.trim() || Number.isNaN(parsed) || !Number.isFinite(parsed)) {
      setError("Enter a score");
      return;
    }
    if (parsed < 0 || !Number.isInteger(parsed)) {
      setError("The score must be a whole number of points");
      return;
    }

    setBusy(true);
    try {
      const submitted = await api.submitScore(parsed);
      setResult(submitted);
      setValue("");
      onSubmitted(submitted);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-xl shadow-slate-950/40">
      <h2 className="text-lg font-semibold tracking-tight text-slate-100">Submit a score</h2>
      <p className="mt-1 text-sm text-slate-400">
        Post your latest run. Your best visible score decides your rank.
      </p>

      <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="score" className="mb-1.5 block text-sm font-medium text-slate-300">
            Score
          </label>
          <input
            id="score"
            name="score"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="12500"
            className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3.5 py-2.5 text-slate-100 placeholder-slate-500 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/30"
          />
        </div>

        {error ? (
          <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Saving…" : "Save score"}
        </button>
      </form>

      {result ? (
        <div className="mt-4 space-y-2 rounded-xl border border-slate-700 bg-slate-950/60 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">Score saved</span>
            <span className="font-mono text-lg font-bold text-slate-100">
              {formatNumber(result.score)}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">Your rank</span>
            <span className="font-semibold text-indigo-300">
              {result.rank === null ? "unranked" : `#${result.rank}`}
            </span>
          </div>
          {result.personal_best ? (
            <p className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm font-semibold text-amber-300">
              New personal best!
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

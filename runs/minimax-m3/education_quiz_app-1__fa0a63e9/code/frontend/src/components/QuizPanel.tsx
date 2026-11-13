import { useCallback, useState } from "react";
import { ApiError, apiRequest } from "@/api";
import type { Attempt, QuizItem } from "@/types";
import AttemptReview from "./AttemptReview";

const LETTERS = ["A", "B", "C", "D"] as const;

const OPTION_KEYS = {
  A: "option_a",
  B: "option_b",
  C: "option_c",
  D: "option_d",
} as const;

interface QuizPanelProps {
  isSignedIn: boolean;
  onRequireSignIn: () => void;
}

export default function QuizPanel({ isSignedIn, onRequireSignIn }: QuizPanelProps) {
  const [phase, setPhase] = useState<"start" | "playing" | "result">("start");
  const [count, setCount] = useState(5);
  const [items, setItems] = useState<QuizItem[]>([]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const start = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await apiRequest<{ items: QuizItem[] }>(`/api/quiz?count=${count}`);
      setItems(result.items);
      setAnswers({});
      setIndex(0);
      setAttempt(null);
      setPhase("playing");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load the quiz.");
    } finally {
      setLoading(false);
    }
  }, [count]);

  const submit = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const payload = items.map((item) => ({
        question_id: item.id,
        selected: answers[item.id],
      }));
      const result = await apiRequest<Attempt>("/api/attempts", {
        method: "POST",
        body: { answers: payload },
      });
      setAttempt(result);
      setPhase("result");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not submit your answers.");
    } finally {
      setLoading(false);
    }
  }, [answers, items]);

  if (phase === "result" && attempt) {
    return (
      <section className="space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
            Results
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-x-8 gap-y-3">
            <div>
              <p className="text-4xl font-extrabold text-slate-900">
                {Math.round(attempt.score)}%
              </p>
              <p className="mt-1 text-sm text-slate-500">Your score</p>
            </div>
            <div>
              <p className="text-4xl font-extrabold text-slate-900">{attempt.correct}</p>
              <p className="mt-1 text-sm text-slate-500">
                Correct out of {attempt.total_questions}
              </p>
            </div>
          </div>

          {!isSignedIn && (
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-sm font-medium text-amber-900">
                Sign in to save your results
              </p>
              <button
                type="button"
                onClick={onRequireSignIn}
                className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-amber-700"
              >
                Sign in
              </button>
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setPhase("start")}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700"
            >
              Play again
            </button>
          </div>
        </div>

        <AttemptReview attempt={attempt} />
      </section>
    );
  }

  if (phase === "start" || items.length === 0) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h2 className="text-xl font-bold text-slate-900">Start a quiz</h2>
        <p className="mt-1 text-sm text-slate-500">
          Answer a handful of general-knowledge questions and see how you score.
        </p>

        <div className="mt-6 flex flex-wrap items-end gap-4">
          <div>
            <label
              htmlFor="count"
              className="block text-sm font-medium text-slate-700"
            >
              Number of questions
            </label>
            <select
              id="count"
              value={count}
              onChange={(event) => setCount(Number(event.target.value))}
              className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value={3}>3</option>
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
            </select>
          </div>
          <button
            type="button"
            onClick={start}
            disabled={loading}
            className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Loading..." : "Start quiz"}
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
      </section>
    );
  }

  const item = items[index];
  const selected = answers[item.id] ?? "";
  const isLast = index === items.length - 1;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-semibold text-indigo-600">
          Question {index + 1} of {items.length}
        </p>
        <div className="h-2 w-32 overflow-hidden rounded-full bg-slate-200 sm:w-48">
          <div
            className="h-full rounded-full bg-indigo-600 transition-all"
            style={{ width: `${((index + 1) / items.length) * 100}%` }}
          />
        </div>
      </div>

      <h2 className="mt-4 text-lg font-semibold leading-snug text-slate-900">
        {item.text}
      </h2>

      <div className="mt-5 space-y-2">
        {LETTERS.map((letter) => (
          <label
            key={letter}
            className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition ${
              selected === letter
                ? "border-indigo-500 bg-indigo-50 text-indigo-900"
                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
            }`}
          >
            <input
              type="radio"
              name={`question-${item.id}`}
              value={letter}
              checked={selected === letter}
              onChange={() => setAnswers((prev) => ({ ...prev, [item.id]: letter }))}
              className="h-4 w-4 accent-indigo-600"
            />
            <span className="font-bold">{letter}.</span>
            <span className="min-w-0 flex-1">{item[OPTION_KEYS[letter]]}</span>
          </label>
        ))}
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-6 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setIndex((prev) => Math.max(0, prev - 1))}
          disabled={index === 0}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Back
        </button>
        {isLast ? (
          <button
            type="button"
            onClick={submit}
            disabled={loading || Object.keys(answers).length < items.length}
            className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Submitting..." : "Submit"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setIndex((prev) => Math.min(items.length - 1, prev + 1))}
            disabled={!selected}
            className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Next
          </button>
        )}
      </div>
    </section>
  );
}

import { useState } from "react";
import type { AttemptAnswerInput, Option, QuizQuestion } from "../types";
import { OPTION_KEYS, optionText } from "../types";

interface Props {
  questions: QuizQuestion[];
  onSubmit: (answers: AttemptAnswerInput[]) => Promise<void>;
  onCancel: () => void;
}

export default function QuizView({ questions, onSubmit, onCancel }: Props) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, Option>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const question = questions[index];
  const total = questions.length;
  const isLast = index === total - 1;
  const selected = answers[question.id];

  async function handleNext() {
    if (!selected) {
      setError("Please choose an answer before continuing.");
      return;
    }
    setError(null);
    if (!isLast) {
      setIndex(index + 1);
      return;
    }
    setBusy(true);
    try {
      await onSubmit(
        questions.map((item) => ({
          question_id: item.id,
          selected: answers[item.id],
        })),
      );
    } catch (err) {
      setError((err as Error).message || "Could not submit your answers.");
    } finally {
      setBusy(false);
    }
  }

  const progress = Math.round(((index + 1) / total) * 100);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center justify-between">
        <span className="text-sm font-semibold text-indigo-600">
          Question {index + 1} of {total}
        </span>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm font-medium text-slate-500 transition hover:text-slate-800"
        >
          Quit quiz
        </button>
      </div>

      <div className="mb-8 h-2 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-indigo-600 transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h2 className="mb-6 text-xl font-semibold text-slate-900 sm:text-2xl">
          {question.text}
        </h2>

        <div className="space-y-3">
          {OPTION_KEYS.map((option) => {
            const isActive = selected === option;
            return (
              <label
                key={option}
                className={`flex cursor-pointer items-center gap-4 rounded-xl border px-4 py-3 transition ${
                  isActive
                    ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200"
                    : "border-slate-200 bg-white hover:border-indigo-300 hover:bg-slate-50"
                }`}
              >
                <input
                  type="radio"
                  name={`question-${question.id}`}
                  value={option}
                  checked={isActive}
                  onChange={() =>
                    setAnswers((current) => ({
                      ...current,
                      [question.id]: option,
                    }))
                  }
                  className="h-4 w-4 accent-indigo-600"
                />
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600">
                  {option}
                </span>
                <span className="text-slate-800">{optionText(question, option)}</span>
              </label>
            );
          })}
        </div>

        {error && (
          <div className="mt-5 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        )}

        <div className="mt-8 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              setIndex(Math.max(0, index - 1));
              setError(null);
            }}
            disabled={index === 0 || busy}
            className="rounded-lg px-4 py-2 font-medium text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Back
          </button>
          <button
            type="button"
            onClick={handleNext}
            disabled={busy}
            className="rounded-lg bg-indigo-600 px-6 py-2.5 font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Submitting…" : isLast ? "Submit" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}

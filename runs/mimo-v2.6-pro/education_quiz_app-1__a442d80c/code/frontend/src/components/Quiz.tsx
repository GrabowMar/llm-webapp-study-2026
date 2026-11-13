import { useEffect, useState } from "react";
import { ApiError, fetchQuiz, submitAttempt } from "../api";
import type { AnswerInput, Attempt, OptionKey, QuizQuestion } from "../types";

const OPTION_KEYS: OptionKey[] = ["A", "B", "C", "D"];

function optionText(question: QuizQuestion, key: OptionKey): string {
  switch (key) {
    case "A":
      return question.option_a;
    case "B":
      return question.option_b;
    case "C":
      return question.option_c;
    case "D":
      return question.option_d;
  }
}

interface QuizProps {
  count: number;
  onFinished: (attempt: Attempt) => void;
  onExit: () => void;
}

export default function Quiz({ count, onFinished, onExit }: QuizProps) {
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [selections, setSelections] = useState<Record<number, OptionKey>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setQuestions(null);
    setError(null);
    setIndex(0);
    setSelections({});
    fetchQuiz(count)
      .then((data) => {
        if (!cancelled) {
          setQuestions(data.items);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Could not load the quiz.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [count]);

  if (error && !questions) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
          {error}
        </div>
        <button
          type="button"
          onClick={onExit}
          className="mt-4 rounded-lg bg-white px-4 py-2 font-medium text-slate-700 shadow-sm ring-1 ring-slate-300 hover:bg-slate-50"
        >
          Back to start
        </button>
      </div>
    );
  }

  if (!questions) {
    return <p className="text-center text-slate-600">Loading questions…</p>;
  }

  if (questions.length === 0) {
    return (
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-slate-600">No questions available right now.</p>
        <button
          type="button"
          onClick={onExit}
          className="mt-4 rounded-lg bg-white px-4 py-2 font-medium text-slate-700 shadow-sm ring-1 ring-slate-300 hover:bg-slate-50"
        >
          Back to start
        </button>
      </div>
    );
  }

  const total = questions.length;
  const question = questions[index];
  const isLast = index === total - 1;
  const selected = selections[question.id];

  const goNext = () => {
    if (!selected) {
      return;
    }
    setIndex(index + 1);
  };

  const submit = async () => {
    if (!selected) {
      return;
    }
    setBusy(true);
    setError(null);
    const answers: AnswerInput[] = questions.map((q) => ({
      question_id: q.id,
      selected: selections[q.id],
    }));
    try {
      const attempt = await submitAttempt(answers);
      onFinished(attempt);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not submit your answers.");
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-600">
          Question {index + 1} of {total}
        </p>
        <button
          type="button"
          onClick={onExit}
          className="text-sm font-medium text-slate-500 hover:text-slate-800"
        >
          Quit
        </button>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-2 rounded-full bg-indigo-600 transition-all"
          style={{ width: `${((index + 1) / total) * 100}%` }}
        />
      </div>

      {error ? (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{question.text}</h2>
        <div className="mt-4 space-y-2" role="radiogroup" aria-label={question.text}>
          {OPTION_KEYS.map((key) => {
            const isSelected = selected === key;
            return (
              <label
                key={key}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-sm ${
                  isSelected
                    ? "border-indigo-600 bg-indigo-50 text-indigo-900"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <input
                  type="radio"
                  name={`question-${question.id}`}
                  value={key}
                  checked={isSelected}
                  onChange={() =>
                    setSelections((prev) => ({ ...prev, [question.id]: key }))
                  }
                  className="h-4 w-4 border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="font-semibold">{key})</span>
                <span className="flex-1">{optionText(question, key)}</span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setIndex(index - 1)}
          disabled={index === 0}
          className="rounded-lg bg-white px-4 py-2 font-medium text-slate-700 shadow-sm ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-50"
        >
          Previous
        </button>
        {isLast ? (
          <button
            type="button"
            onClick={submit}
            disabled={!selected || busy}
            className="rounded-lg bg-indigo-600 px-5 py-2 font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {busy ? "Submitting…" : "Submit"}
          </button>
        ) : (
          <button
            type="button"
            onClick={goNext}
            disabled={!selected}
            className="rounded-lg bg-indigo-600 px-5 py-2 font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            Next
          </button>
        )}
      </div>
    </div>
  );
}

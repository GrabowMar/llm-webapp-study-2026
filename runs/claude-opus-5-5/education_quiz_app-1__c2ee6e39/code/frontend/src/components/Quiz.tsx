import { useState } from "react";
import { ApiError, OPTIONS, api, optionText, type Attempt, type Option, type QuizQuestion } from "../api";

interface Props {
  onFinished: (attempt: Attempt) => void;
}

export default function Quiz({ onFinished }: Props) {
  const [count, setCount] = useState(5);
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, Option>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.quiz(count);
      if (res.items.length === 0) {
        setError("There are no questions available right now.");
        return;
      }
      setQuestions(res.items);
      setIndex(0);
      setAnswers({});
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load the quiz");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!questions) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.submit(
        questions.map((q) => ({ question_id: q.id, selected: answers[q.id] })),
      );
      onFinished(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not submit your answers");
    } finally {
      setBusy(false);
    }
  }

  const primary =
    "rounded-md bg-indigo-600 px-5 py-2 font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50";

  if (!questions) {
    return (
      <div className="mx-auto max-w-xl rounded-xl bg-white p-6 text-center shadow">
        <h2 className="text-2xl font-semibold">Ready for a quiz?</h2>
        <p className="mt-2 text-slate-600">Answer a few random general-knowledge questions.</p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <label htmlFor="count" className="text-sm font-medium text-slate-700">
            Questions
          </label>
          <select
            id="count"
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="rounded-md border border-slate-300 px-3 py-2"
          >
            {[3, 5, 10, 15, 20].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <button type="button" className={primary} onClick={start} disabled={busy}>
            {busy ? "Loading…" : "Start quiz"}
          </button>
        </div>
        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  const q = questions[index];
  const isLast = index === questions.length - 1;
  const selected = answers[q.id];

  return (
    <div className="mx-auto max-w-xl rounded-xl bg-white p-6 shadow">
      <div className="mb-2 flex items-center justify-between text-sm text-slate-500">
        <span>
          Question {index + 1} of {questions.length}
        </span>
        <button
          type="button"
          className="text-slate-500 hover:text-slate-700 hover:underline"
          onClick={() => setQuestions(null)}
        >
          Quit
        </button>
      </div>
      <div className="mb-4 h-2 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full bg-indigo-500 transition-all"
          style={{ width: `${((index + 1) / questions.length) * 100}%` }}
        />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!selected) return;
          if (isLast) submit();
          else setIndex(index + 1);
        }}
      >
        <fieldset>
          <legend className="mb-4 text-lg font-semibold">{q.text}</legend>
          <div className="space-y-2">
            {OPTIONS.map((opt) => (
              <label
                key={opt}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition ${
                  selected === opt
                    ? "border-indigo-500 bg-indigo-50"
                    : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                <input
                  type="radio"
                  name={`question-${q.id}`}
                  value={opt}
                  checked={selected === opt}
                  onChange={() => setAnswers({ ...answers, [q.id]: opt })}
                  className="h-4 w-4 accent-indigo-600"
                />
                <span className="font-medium text-slate-500">{opt}.</span>
                <span>{optionText(q, opt)}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        <div className="mt-6 flex justify-between">
          <button
            type="button"
            className="rounded-md px-4 py-2 text-slate-600 hover:bg-slate-100 disabled:invisible"
            disabled={index === 0}
            onClick={() => setIndex(index - 1)}
          >
            Back
          </button>
          <button type="submit" className={primary} disabled={!selected || busy}>
            {isLast ? (busy ? "Submitting…" : "Submit") : "Next"}
          </button>
        </div>
      </form>
    </div>
  );
}

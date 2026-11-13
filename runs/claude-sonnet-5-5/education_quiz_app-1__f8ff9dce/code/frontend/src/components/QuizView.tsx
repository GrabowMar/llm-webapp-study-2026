import { useEffect, useState } from "react";
import { ApiError, Attempt, LETTERS, Letter, QuizQuestion, api, getToken, optionText } from "../api";
import { btnPrimary, btnSecondary, cardCls } from "../ui";

export default function QuizView({
  onDone,
  onSessionExpired,
}: {
  onDone: (a: Attempt) => void;
  onSessionExpired: () => void;
}) {
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, Letter>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    api<{ items: QuizQuestion[] }>("/quiz?count=5", { auth: false })
      .then((d) => live && setQuestions(d.items))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, []);

  if (error && !questions) return <p role="alert" className="text-red-600">{error}</p>;
  if (!questions) return <p className="text-slate-500">Loading…</p>;
  if (questions.length === 0) return <p>No questions available.</p>;

  const q = questions[index];
  const last = index === questions.length - 1;
  const selected = answers[q.id];

  const submit = async () => {
    setBusy(true);
    setError(null);
    const body = {
      answers: questions.map((x) => ({ question_id: x.id, selected: answers[x.id] })),
    };
    try {
      const result = await api<Attempt>("/attempts", { method: "POST", body });
      onDone(result);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401 && getToken()) {
        onSessionExpired();
        return;
      }
      setError(e instanceof Error ? e.message : "Something went wrong");
      setBusy(false);
    }
  };

  return (
    <section className={cardCls}>
      <p className="mb-2 text-sm font-medium text-slate-500" data-testid="progress">
        Question {index + 1} of {questions.length}
      </p>
      <div className="mb-4 h-2 overflow-hidden rounded bg-slate-200">
        <div className="h-full bg-indigo-600" style={{ width: `${((index + 1) / questions.length) * 100}%` }} />
      </div>
      <fieldset>
        <legend className="mb-4 text-lg font-semibold">{q.text}</legend>
        <div className="space-y-2">
          {LETTERS.map((l) => (
            <label
              key={l}
              className={`flex cursor-pointer items-center gap-3 rounded border px-3 py-2 hover:bg-slate-50 ${
                selected === l ? "border-indigo-600 bg-indigo-50" : "border-slate-300"
              }`}
            >
              <input
                type="radio"
                name={`question-${q.id}`}
                value={l}
                checked={selected === l}
                onChange={() => setAnswers({ ...answers, [q.id]: l })}
              />
              <span>{optionText(q, l)}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
      <div className="mt-6 flex justify-between">
        <button
          className={btnSecondary}
          disabled={index === 0 || busy}
          onClick={() => setIndex(index - 1)}
        >
          Back
        </button>
        {last ? (
          <button className={btnPrimary} disabled={!selected || busy} onClick={submit}>
            Submit
          </button>
        ) : (
          <button className={btnPrimary} disabled={!selected} onClick={() => setIndex(index + 1)}>
            Next
          </button>
        )}
      </div>
    </section>
  );
}

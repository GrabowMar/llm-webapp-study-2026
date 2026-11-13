import { useState } from "react";
import { Attempt, Question, submitAttempt, fetchQuiz } from "./api";

const OPTIONS = ["A", "B", "C", "D"] as const;

function optionText(q: Question, key: string): string {
  return (q as Record<string, string>)[`option_${key.toLowerCase()}`] ?? "";
}

export default function Quiz({
  count,
  isAuthed,
  onResult,
}: {
  count: number;
  isAuthed: boolean;
  onResult: (attempt: Attempt) => void;
}) {
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [index, setIndex] = useState(0);
  const [selections, setSelections] = useState<Record<number, string>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function start() {
    setLoading(true);
    setError("");
    const res = await fetchQuiz(count);
    setLoading(false);
    if (res.ok) {
      setQuestions(res.data.items);
      setIndex(0);
      setSelections({});
    } else {
      setError("Could not load the quiz.");
    }
  }

  if (loading) {
    return <p className="text-center mt-16">Loading quiz…</p>;
  }

  if (!questions) {
    return (
      <div className="max-w-sm mx-auto mt-16 text-center">
        <button
          onClick={start}
          className="bg-blue-600 text-white px-6 py-3 rounded-lg text-lg"
        >
          Start a quiz
        </button>
        {error && <p className="text-red-600 mt-4">{error}</p>}
      </div>
    );
  }

  const q = questions[index];
  const selected = selections[q.id];

  async function next() {
    if (index < questions!.length - 1) {
      setIndex(index + 1);
    } else {
      await submit();
    }
  }

  async function submit() {
    const answers = questions!.map((question) => ({
      question_id: question.id,
      selected: selections[question.id],
    }));
    const res = await submitAttempt(answers);
    if (res.ok) {
      onResult(res.data);
      return;
    }
    setError((res.data as { error?: string }).error ?? "Submit failed.");
  }

  const answered = selected !== undefined;

  return (
    <div className="max-w-lg mx-auto mt-10">
      <p className="text-sm text-gray-500 mb-2">
        Question {index + 1} of {questions.length}
      </p>
      <div className="h-2 w-full bg-gray-200 rounded mb-6">
        <div
          className="h-2 bg-blue-600 rounded"
          style={{ width: `${((index + 1) / questions.length) * 100}%` }}
        />
      </div>

      <h2 className="text-xl font-semibold mb-4">{q.text}</h2>

      <div className="space-y-2">
        {OPTIONS.map((letter) => (
          <label
            key={letter}
            className={`flex items-center gap-3 border rounded p-3 cursor-pointer ${
              selected === letter ? "border-blue-600 bg-blue-50" : "hover:bg-gray-50"
            }`}
          >
            <input
              type="radio"
              name={`question-${q.id}`}
              className="accent-blue-600"
              checked={selected === letter}
              onChange={() => setSelections({ ...selections, [q.id]: letter })}
            />
            <span className="font-medium">{letter}.</span>
            <span>{optionText(q, letter)}</span>
          </label>
        ))}
      </div>

      {error && <p className="text-red-600 mt-4">{error}</p>}

      <div className="mt-6 flex justify-between items-center">
        <button
          onClick={() => setIndex(Math.max(0, index - 1))}
          disabled={index === 0}
          className="px-4 py-2 rounded border disabled:opacity-40"
        >
          Back
        </button>
        {index < questions.length - 1 ? (
          <button
            onClick={next}
            disabled={!answered}
            className="px-6 py-2 rounded bg-blue-600 text-white disabled:opacity-40"
          >
            Next
          </button>
        ) : (
          <button
            onClick={next}
            disabled={!answered}
            className="px-6 py-2 rounded bg-green-600 text-white disabled:opacity-40"
          >
            Submit
          </button>
        )}
      </div>
    </div>
  );
}

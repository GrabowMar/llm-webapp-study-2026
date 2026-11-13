import { useEffect, useState } from "react";
import { adminAddQuestion, adminListQuestions, Question } from "./api";

const OPTIONS = ["A", "B", "C", "D"] as const;

export default function Admin() {
  const [text, setText] = useState("");
  const [options, setOptions] = useState({ a: "", b: "", c: "", d: "" });
  const [correct, setCorrect] = useState("A");
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null
  );
  const [questions, setQuestions] = useState<Question[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 10;

  async function load() {
    const res = await adminListQuestions(page, pageSize);
    if (res.ok) {
      setQuestions(res.data.items);
      setTotal(res.data.total);
    }
  }

  useEffect(() => {
    load();
  }, [page]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const res = await adminAddQuestion({
      text,
      option_a: options.a,
      option_b: options.b,
      option_c: options.c,
      option_d: options.d,
      correct_option: correct,
    });
    if (res.ok) {
      setText("");
      setOptions({ a: "", b: "", c: "", d: "" });
      setCorrect("A");
      setMessage({ kind: "ok", text: "Question added." });
      load();
    } else {
      setMessage({
        kind: "err",
        text: (res.data as { error?: string }).error ?? "Failed to add question.",
      });
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="max-w-2xl mx-auto mt-10">
      <h1 className="text-2xl font-bold mb-6">Admin</h1>

      <form onSubmit={submit} className="border rounded p-4 mb-8 space-y-3">
        <h2 className="font-semibold">Add question</h2>
        <input
          className="w-full border rounded px-3 py-2"
          placeholder="Question text"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {OPTIONS.map((letter) => (
          <input
            key={letter}
            className="w-full border rounded px-3 py-2"
            placeholder={`Option ${letter}`}
            value={options[letter.toLowerCase() as keyof typeof options]}
            onChange={(e) =>
              setOptions({
                ...options,
                [letter.toLowerCase()]: e.target.value,
              })
            }
          />
        ))}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Correct option:</span>
          {OPTIONS.map((letter) => (
            <label key={letter} className="flex items-center gap-1 text-sm">
              <input
                type="radio"
                className="accent-blue-600"
                checked={correct === letter}
                onChange={() => setCorrect(letter)}
              />
              {letter}
            </label>
          ))}
        </div>
        {message && (
          <p
            className={
              message.kind === "ok" ? "text-green-700 text-sm" : "text-red-600 text-sm"
            }
          >
            {message.text}
          </p>
        )}
        <button
          type="submit"
          className="bg-blue-600 text-white px-4 py-2 rounded"
        >
          Add question
        </button>
      </form>

      <h2 className="font-semibold mb-2">Questions ({total})</h2>
      <ul className="space-y-2">
        {questions.map((q) => (
          <li key={q.id} className="border rounded p-3">
            <p className="font-medium">{q.text}</p>
            <p className="text-sm text-gray-600">
              A: {q.option_a} · B: {q.option_b} · C: {q.option_c} · D: {q.option_d}
            </p>
            <p className="text-sm text-green-700">
              Correct: {q.correct_option}
            </p>
          </li>
        ))}
      </ul>

      <div className="flex gap-2 mt-4 items-center">
        <button
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
          className="px-3 py-1 rounded border disabled:opacity-40"
        >
          Prev
        </button>
        <span className="text-sm">
          Page {page} of {totalPages}
        </span>
        <button
          disabled={page >= totalPages}
          onClick={() => setPage(page + 1)}
          className="px-3 py-1 rounded border disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}

import { useState } from "react";
import type { OptionLetter, QuizQuestion } from "../types";

const LETTERS: OptionLetter[] = ["A", "B", "C", "D"];

interface QuizProps {
  questions: QuizQuestion[];
  onSubmit: (answers: { question_id: number; selected: OptionLetter }[]) => void;
}

export default function Quiz({ questions, onSubmit }: QuizProps) {
  const [index, setIndex] = useState(0);
  const [selections, setSelections] = useState<Record<number, OptionLetter>>({});

  const question = questions[index];
  const selected = selections[question.id];
  const isLast = index === questions.length - 1;

  const choose = (letter: OptionLetter) => {
    setSelections((previous) => ({ ...previous, [question.id]: letter }));
  };

  const goNext = () => {
    if (isLast) {
      onSubmit(
        questions.map((item) => ({
          question_id: item.id,
          selected: selections[item.id],
        })),
      );
    } else {
      setIndex(index + 1);
    }
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between text-sm font-medium text-slate-600">
        <span>{`Question ${index + 1} of ${questions.length}`}</span>
        <span className="rounded-full bg-indigo-50 px-3 py-1 text-indigo-600">
          {Object.keys(selections).length}/{questions.length} answered
        </span>
      </div>
      <div className="mb-6 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-2 rounded-full bg-indigo-500 transition-all"
          style={{ width: `${((index + 1) / questions.length) * 100}%` }}
        />
      </div>

      <h2 className="mb-5 text-xl font-semibold text-slate-900">{question.text}</h2>

      <div className="space-y-3">
        {LETTERS.map((letter) => {
          const optionText = question[`option_${letter.toLowerCase() as "a" | "b" | "c" | "d"}`];
          const isSelected = selected === letter;
          return (
            <label
              key={letter}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${
                isSelected
                  ? "border-indigo-500 bg-indigo-50"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <input
                type="radio"
                name={`question-${question.id}`}
                checked={isSelected}
                onChange={() => choose(letter)}
                className="mt-1 h-4 w-4 accent-indigo-600"
              />
              <span className="text-slate-800">
                <span className="font-semibold">{letter}.</span> {optionText}
              </span>
            </label>
          );
        })}
      </div>

      <div className="mt-6 flex justify-between">
        <button
          type="button"
          onClick={() => setIndex(index - 1)}
          disabled={index === 0}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Back
        </button>
        <button
          type="button"
          onClick={goNext}
          disabled={!selected}
          className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isLast ? "Submit" : "Next"}
        </button>
      </div>
    </section>
  );
}

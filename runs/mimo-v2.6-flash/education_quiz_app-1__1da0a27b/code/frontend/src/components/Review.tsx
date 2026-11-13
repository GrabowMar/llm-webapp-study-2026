import type { AnswerReview, Attempt } from "../types";

const LETTERS = ["A", "B", "C", "D"] as const;

function QuestionReview({ answer, index }: { answer: AnswerReview; index: number }) {
  return (
    <li className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="mb-3 font-medium text-slate-900">
        <span className="mr-2 text-slate-400">{index + 1}.</span>
        {answer.text}
      </p>
      <ul className="space-y-2">
        {LETTERS.map((letter) => {
          const optionText = answer[`option_${letter.toLowerCase() as "a" | "b" | "c" | "d"}`];
          const isCorrect = letter === answer.correct_option;
          const isSelected = letter === answer.selected;
          const tone = isCorrect
            ? "border-green-500 bg-green-50"
            : isSelected
              ? "border-red-400 bg-red-50"
              : "border-slate-200 bg-slate-50";
          return (
            <li
              key={letter}
              className={`flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm ${tone}`}
            >
              <span className="font-semibold">
                {letter}.
              </span>
              <span className={isCorrect ? "text-green-800" : "text-slate-700"}>
                {optionText}
              </span>
              {isSelected && (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    isCorrect ? "bg-green-600 text-white" : "bg-red-500 text-white"
                  }`}
                >
                  Your answer
                </span>
              )}
              {isCorrect && (
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                  Correct
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-sm font-medium">
        {answer.is_correct ? (
          <span className="text-green-700">Correct</span>
        ) : (
          <span className="text-red-600">Incorrect</span>
        )}
      </p>
    </li>
  );
}

export default function Review({ attempt }: { attempt: Attempt }) {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <p className="text-4xl font-bold text-indigo-600">Score: {attempt.score}%</p>
        <p className="mt-2 text-lg text-slate-700">
          {attempt.correct} of {attempt.total_questions} correct
        </p>
        <p className="mt-1 text-sm text-slate-500">
          {attempt.total_questions - attempt.correct} incorrect
        </p>
      </div>
      <ul className="space-y-4">
        {attempt.answers.map((answer, index) => (
          <QuestionReview key={`${answer.question_id}-${index}`} answer={answer} index={index} />
        ))}
      </ul>
    </div>
  );
}

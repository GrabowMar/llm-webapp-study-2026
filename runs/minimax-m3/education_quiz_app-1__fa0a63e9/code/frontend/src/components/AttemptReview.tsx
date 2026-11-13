import type { Attempt, AttemptAnswer } from "@/types";

const LETTERS = ["A", "B", "C", "D"] as const;

export function optionText(answer: AttemptAnswer, letter: string): string {
  switch (letter) {
    case "A":
      return answer.option_a;
    case "B":
      return answer.option_b;
    case "C":
      return answer.option_c;
    case "D":
      return answer.option_d;
    default:
      return "";
  }
}

interface AttemptReviewProps {
  attempt: Attempt;
}

export default function AttemptReview({ attempt }: AttemptReviewProps) {
  return (
    <ol className="space-y-4">
      {attempt.answers.map((answer, index) => (
        <li
          key={answer.question_id}
          className={`rounded-xl border p-4 ${
            answer.is_correct ? "border-emerald-200 bg-emerald-50/60" : "border-red-200 bg-red-50/60"
          }`}
        >
          <div className="flex items-start gap-3">
            <span
              className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                answer.is_correct ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
              }`}
            >
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-slate-900">{answer.text}</p>
              <ul className="mt-3 space-y-1.5">
                {LETTERS.map((letter) => {
                  const isSelected = answer.selected === letter;
                  const isCorrect = answer.correct_option === letter;
                  return (
                    <li
                      key={letter}
                      className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${
                        isCorrect
                          ? "border-emerald-300 bg-emerald-100 text-emerald-900"
                          : isSelected
                            ? "border-red-300 bg-red-100 text-red-900"
                            : "border-slate-200 bg-white text-slate-600"
                      }`}
                    >
                      <span className="font-bold">{letter}.</span>
                      <span className="min-w-0 flex-1">{optionText(answer, letter)}</span>
                      {isSelected && (
                        <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">
                          Your answer
                        </span>
                      )}
                      {isCorrect && (
                        <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">
                          Correct
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

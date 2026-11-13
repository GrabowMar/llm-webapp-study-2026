import type { OptionKey, ReviewAnswer } from "../types";

const OPTION_KEYS: OptionKey[] = ["A", "B", "C", "D"];

function optionText(answer: ReviewAnswer, key: OptionKey): string {
  switch (key) {
    case "A":
      return answer.option_a;
    case "B":
      return answer.option_b;
    case "C":
      return answer.option_c;
    case "D":
      return answer.option_d;
  }
}

export default function ReviewList({ answers }: { answers: ReviewAnswer[] }) {
  return (
    <div className="space-y-4">
      {answers.map((answer, index) => {
        const chosen = answer.selected;
        return (
          <div
            key={`${answer.question_id}-${index}`}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <p className="font-medium text-slate-900">
              {index + 1}. {answer.text}
            </p>
            <ul className="mt-3 space-y-2">
              {OPTION_KEYS.map((key) => {
                const isCorrect = key === answer.correct_option;
                const isChosen = key === chosen;
                let classes =
                  "border-slate-200 bg-white text-slate-700";
                if (isCorrect && isChosen) {
                  classes = "border-green-400 bg-green-50 text-green-900";
                } else if (isCorrect) {
                  classes = "border-green-300 bg-green-50 text-green-900";
                } else if (isChosen) {
                  classes = "border-red-300 bg-red-50 text-red-900";
                }
                return (
                  <li
                    key={key}
                    className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm ${classes}`}
                  >
                    <span className="font-semibold">{key})</span>
                    <span className="flex-1">{optionText(answer, key)}</span>
                    {isChosen ? (
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          isCorrect
                            ? "bg-green-600 text-white"
                            : "bg-red-600 text-white"
                        }`}
                      >
                        Your answer
                      </span>
                    ) : null}
                    {isCorrect ? (
                      <span className="rounded-full bg-green-600 px-2 py-0.5 text-xs font-medium text-white">
                        Correct
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {!answer.is_correct ? (
              <p className="mt-2 text-sm text-red-700">
                You chose {chosen}; the correct answer is {answer.correct_option}.
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

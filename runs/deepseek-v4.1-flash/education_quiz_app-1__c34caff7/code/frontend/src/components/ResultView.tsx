import type { Attempt } from "../types";
import { OPTION_KEYS, optionText } from "../types";

interface Props {
  attempt: Attempt;
  isGuest: boolean;
  signedIn: boolean;
  onSignIn: () => void;
  onRestart: () => void;
  title?: string;
}

export default function ResultView({
  attempt,
  isGuest,
  signedIn,
  onSignIn,
  onRestart,
  title = "Your result",
}: Props) {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8 rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 p-8 text-white shadow-lg">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-indigo-200">
              {title}
            </p>
            <p className="mt-2 text-5xl font-extrabold">{attempt.score}%</p>
            <p className="mt-1 text-indigo-100">
              {attempt.correct} of {attempt.total_questions} correct
            </p>
          </div>
          <button
            type="button"
            onClick={onRestart}
            className="rounded-lg bg-white/15 px-5 py-2.5 font-semibold text-white backdrop-blur transition hover:bg-white/25"
          >
            Take another quiz
          </button>
        </div>
      </div>

      {isGuest && !signedIn && (
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
          <p className="font-medium text-amber-900">
            Sign in to save your results
          </p>
          <button
            type="button"
            onClick={onSignIn}
            className="rounded-lg bg-amber-500 px-4 py-2 font-semibold text-white transition hover:bg-amber-600"
          >
            Sign in
          </button>
        </div>
      )}
      {isGuest && signedIn && (
        <div className="mb-8 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-600">
          This result was played as a visitor, so it wasn't saved. Take another
          quiz while signed in to keep it in your history.
        </div>
      )}

      <div className="space-y-4">
        {attempt.answers.map((answer, index) => (
          <div
            key={`${answer.question_id}-${index}`}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="mb-4 flex items-start gap-3">
              <span
                className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${
                  answer.is_correct ? "bg-emerald-500" : "bg-rose-500"
                }`}
              >
                {answer.is_correct ? "✓" : "✕"}
              </span>
              <h3 className="font-semibold text-slate-900">
                {index + 1}. {answer.text}
              </h3>
            </div>

            <ul className="space-y-2">
              {OPTION_KEYS.map((option) => {
                const isChosen = answer.selected === option;
                const isCorrect = answer.correct_option === option;
                let classes =
                  "flex items-center gap-3 rounded-lg border px-3 py-2 text-sm";
                if (isCorrect) {
                  classes += " border-emerald-300 bg-emerald-50 text-emerald-900";
                } else if (isChosen) {
                  classes += " border-rose-300 bg-rose-50 text-rose-900";
                } else {
                  classes += " border-slate-200 bg-white text-slate-600";
                }
                return (
                  <li key={option} className={classes}>
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-slate-600 shadow-sm">
                      {option}
                    </span>
                    <span className="flex-1">{optionText(answer, option)}</span>
                    {isChosen && (
                      <span className="text-xs font-semibold uppercase tracking-wide">
                        Your answer
                      </span>
                    )}
                    {isCorrect && !isChosen && (
                      <span className="text-xs font-semibold uppercase tracking-wide">
                        Correct
                      </span>
                    )}
                    {isCorrect && isChosen && (
                      <span className="text-xs font-semibold uppercase tracking-wide">
                        Correct
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

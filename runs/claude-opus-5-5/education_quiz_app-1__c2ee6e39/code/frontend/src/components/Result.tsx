import { OPTIONS, optionText, type Attempt } from "../api";

interface Props {
  attempt: Attempt;
  signedIn: boolean;
  onSignIn?: () => void;
  onAgain?: () => void;
  onBack?: () => void;
}

export function formatDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export default function Result({ attempt, signedIn, onSignIn, onAgain, onBack }: Props) {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="rounded-xl bg-white p-6 text-center shadow">
        {onBack && (
          <div className="mb-2 text-left">
            <button
              type="button"
              className="text-sm text-indigo-600 hover:underline"
              onClick={onBack}
            >
              ← Back to my attempts
            </button>
          </div>
        )}
        <p className="text-sm uppercase tracking-wide text-slate-500">Score</p>
        <p className="text-5xl font-bold text-indigo-600">{attempt.score}%</p>
        <p className="mt-2 text-slate-700">
          {attempt.correct} of {attempt.total_questions} correct
        </p>
        {attempt.submitted_at && (
          <p className="mt-1 text-sm text-slate-500">{formatDate(attempt.submitted_at)}</p>
        )}
        {!signedIn && (
          <div className="mt-4 rounded-md bg-amber-50 px-4 py-3 text-amber-800">
            <button type="button" className="font-medium underline" onClick={onSignIn}>
              Sign in to save your results
            </button>
          </div>
        )}
        {signedIn && attempt.saved && (
          <p className="mt-3 text-sm text-green-700">Your result has been saved.</p>
        )}
        {onAgain && (
          <button
            type="button"
            className="mt-4 rounded-md bg-indigo-600 px-5 py-2 font-medium text-white hover:bg-indigo-700"
            onClick={onAgain}
          >
            Take another quiz
          </button>
        )}
      </div>
      <ol className="space-y-3">
        {attempt.answers.map((a, i) => (
          <li
            key={`${a.question_id}-${i}`}
            className={`rounded-xl border-l-4 bg-white p-5 shadow ${
              a.is_correct ? "border-green-500" : "border-red-500"
            }`}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <p className="font-semibold">
                {i + 1}. {a.text}
              </p>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                  a.is_correct ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                }`}
              >
                {a.is_correct ? "Correct" : "Wrong"}
              </span>
            </div>
            <ul className="space-y-1">
              {OPTIONS.map((opt) => {
                const isCorrect = opt === a.correct_option;
                const isChosen = opt === a.selected;
                let cls = "border-slate-200 text-slate-700";
                if (isCorrect) cls = "border-green-400 bg-green-50 text-green-900";
                else if (isChosen) cls = "border-red-400 bg-red-50 text-red-900";
                return (
                  <li
                    key={opt}
                    className={`flex items-center justify-between rounded-md border px-3 py-2 text-sm ${cls}`}
                  >
                    <span>
                      <span className="font-medium">{opt}.</span> {optionText(a, opt)}
                    </span>
                    <span className="flex gap-2 text-xs font-medium">
                      {isChosen && <span>Your answer</span>}
                      {isCorrect && <span>✓ Correct answer</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}

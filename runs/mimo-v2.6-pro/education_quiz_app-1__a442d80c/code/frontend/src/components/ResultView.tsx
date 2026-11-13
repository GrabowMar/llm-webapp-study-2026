import { formatDate, formatScore } from "../format";
import type { Attempt } from "../types";
import ReviewList from "./ReviewList";

interface ResultViewProps {
  attempt: Attempt;
  signedIn: boolean;
  onSignIn: () => void;
  onStartQuiz: () => void;
  onShowAttempts?: () => void;
  onBack?: () => void;
  backLabel?: string;
}

export default function ResultView({
  attempt,
  signedIn,
  onSignIn,
  onStartQuiz,
  onShowAttempts,
  onBack,
  backLabel = "Back",
}: ResultViewProps) {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="text-sm font-medium text-slate-500 hover:text-slate-800"
        >
          &larr; {backLabel}
        </button>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Your score</p>
        <p className="mt-2 text-5xl font-bold text-indigo-600">{formatScore(attempt.score)}</p>
        <p className="mt-2 text-slate-700">
          You answered <span className="font-semibold">{attempt.correct}</span> of{" "}
          <span className="font-semibold">{attempt.total_questions}</span> questions correctly.
        </p>
        <p className="mt-1 text-sm text-slate-500">Submitted {formatDate(attempt.submitted_at)}</p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={onStartQuiz}
            className="rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700"
          >
            Take another quiz
          </button>
          {signedIn && onShowAttempts ? (
            <button
              type="button"
              onClick={onShowAttempts}
              className="rounded-lg bg-white px-4 py-2 font-medium text-slate-700 shadow-sm ring-1 ring-slate-300 hover:bg-slate-50"
            >
              My attempts
            </button>
          ) : null}
        </div>
      </div>

      {!signedIn ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-center shadow-sm">
          <p className="font-medium text-amber-900">Sign in to save your results</p>
          <p className="mt-1 text-sm text-amber-800">
            Create an account or sign in to keep this attempt in your history.
          </p>
          <button
            type="button"
            onClick={onSignIn}
            className="mt-3 rounded-lg bg-amber-600 px-4 py-2 font-medium text-white hover:bg-amber-700"
          >
            Sign in or register
          </button>
        </div>
      ) : null}

      <div>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Review</h2>
        <ReviewList answers={attempt.answers} />
      </div>
    </div>
  );
}

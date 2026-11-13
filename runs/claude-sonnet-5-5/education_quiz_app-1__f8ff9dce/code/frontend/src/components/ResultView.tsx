import { Attempt } from "../api";
import { btnPrimary, cardCls } from "../ui";
import ReviewList from "./ReviewList";

export default function ResultView({
  attempt,
  signedIn,
  onSignIn,
  onAgain,
  onBack,
}: {
  attempt: Attempt;
  signedIn?: boolean;
  onSignIn?: () => void;
  onAgain?: () => void;
  onBack?: () => void;
}) {
  return (
    <section className={`${cardCls} space-y-4`}>
      <h2 className="text-xl font-bold">Result</h2>
      <p className="text-3xl font-bold text-indigo-700" data-testid="score">
        Score: {attempt.score}%
      </p>
      <p data-testid="correct">
        {attempt.correct} of {attempt.total_questions} correct
      </p>
      {signedIn === false && (
        <div className="rounded border border-amber-300 bg-amber-50 p-3">
          <button onClick={onSignIn} className="font-medium text-indigo-700 underline">
            Sign in to save your results
          </button>
        </div>
      )}
      <ReviewList items={attempt.answers} />
      <div className="flex gap-3">
        {onAgain && (
          <button className={btnPrimary} onClick={onAgain}>
            Take another quiz
          </button>
        )}
        {onBack && (
          <button className={btnPrimary} onClick={onBack}>
            Back to attempts
          </button>
        )}
      </div>
    </section>
  );
}

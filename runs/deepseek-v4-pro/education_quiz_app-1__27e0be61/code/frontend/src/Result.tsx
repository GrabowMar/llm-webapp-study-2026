import { Attempt } from "./api";

const OPTIONS = ["A", "B", "C", "D"] as const;

function optionText(
  a: Attempt["answers"][number],
  key: string
): string {
  return (a as Record<string, string>)[`option_${key.toLowerCase()}`] ?? "";
}

export default function Result({
  attempt,
  isAuthed,
  onNewQuiz,
  onSignIn,
}: {
  attempt: Attempt;
  isAuthed: boolean;
  onNewQuiz: () => void;
  onSignIn: () => void;
}) {
  return (
    <div className="max-w-lg mx-auto mt-10">
      <h1 className="text-2xl font-bold mb-2">Your result</h1>
      <p className="text-lg mb-4">
        Score:{" "}
        <span className="font-semibold">
          {attempt.correct} / {attempt.total_questions}
        </span>
      </p>

      {!isAuthed && (
        <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-6">
          <p className="text-sm text-blue-800">
            Sign in to save your results.
          </p>
          <button
            onClick={onSignIn}
            className="mt-2 text-sm bg-blue-600 text-white px-3 py-1 rounded"
          >
            Sign in
          </button>
        </div>
      )}

      <div className="space-y-4">
        {attempt.answers.map((a, i) => (
          <div key={i} className="border rounded p-4">
            <p className="font-medium mb-2">{a.text}</p>
            <div className="space-y-1 text-sm">
              {OPTIONS.map((letter) => {
                const isChosen = a.selected === letter;
                const isCorrect = a.correct_option === letter;
                let cls = "text-gray-700";
                if (isCorrect) cls = "text-green-700 font-semibold";
                if (isChosen && !isCorrect) cls = "text-red-600 font-semibold";
                return (
                  <p key={letter} className={cls}>
                    <span className="font-semibold">{letter}.</span>{" "}
                    {optionText(a, letter)}
                    {isChosen && " ← your answer"}
                    {isCorrect && " ✓"}
                  </p>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={onNewQuiz}
        className="mt-6 bg-blue-600 text-white px-6 py-2 rounded"
      >
        New quiz
      </button>
    </div>
  );
}

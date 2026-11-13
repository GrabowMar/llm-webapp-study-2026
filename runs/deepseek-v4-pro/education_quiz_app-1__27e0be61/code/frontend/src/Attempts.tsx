import { useEffect, useState } from "react";
import { Attempt, fetchAttempt, fetchAttempts } from "./api";
import Result from "./Result";

export default function Attempts() {
  const [attempts, setAttempts] = useState<Attempt[] | null>(null);
  const [selected, setSelected] = useState<Attempt | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchAttempts().then((res) => {
      if (res.ok) setAttempts(res.data.items);
      else setError("Could not load your attempts.");
    });
  }, []);

  if (selected) {
    return (
      <div>
        <button
          onClick={() => setSelected(null)}
          className="mt-4 ml-4 text-blue-600 text-sm"
        >
          ← Back to attempts
        </button>
        <Result
          attempt={selected}
          isAuthed={true}
          onNewQuiz={() => setSelected(null)}
          onSignIn={() => {}}
        />
      </div>
    );
  }

  if (attempts === null) return <p className="text-center mt-16">Loading…</p>;

  return (
    <div className="max-w-lg mx-auto mt-10">
      <h1 className="text-2xl font-bold mb-4">Your attempts</h1>
      {error && <p className="text-red-600 mb-4">{error}</p>}
      {attempts.length === 0 ? (
        <p className="text-gray-600">No attempts yet.</p>
      ) : (
        <ul className="space-y-2">
          {attempts.map((a) => (
            <li key={a.id}>
              <button
                onClick={async () => {
                  const res = await fetchAttempt(a.id);
                  if (res.ok) setSelected(res.data);
                }}
                className="w-full flex justify-between items-center border rounded p-3 hover:bg-gray-50"
              >
                <span className="text-sm text-gray-600">
                  {new Date(a.submitted_at).toLocaleString()}
                </span>
                <span className="font-semibold">
                  {a.correct}/{a.total_questions}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

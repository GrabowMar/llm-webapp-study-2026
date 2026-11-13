import { LETTERS, ReviewItem, optionText } from "../api";

export default function ReviewList({ items }: { items: ReviewItem[] }) {
  return (
    <ol className="space-y-4">
      {items.map((it, i) => (
        <li key={`${it.question_id}-${i}`} className="rounded border border-slate-200 p-4">
          <p className="mb-2 font-semibold">
            {i + 1}. {it.text}{" "}
            <span className={it.is_correct ? "text-green-700" : "text-red-700"}>
              {it.is_correct ? "Correct" : "Incorrect"}
            </span>
          </p>
          <ul className="space-y-1">
            {LETTERS.map((l) => {
              const chosen = it.selected === l;
              const correct = it.correct_option === l;
              const cls = correct
                ? "border-green-600 bg-green-50"
                : chosen
                  ? "border-red-600 bg-red-50"
                  : "border-slate-200";
              return (
                <li key={l} className={`flex flex-wrap items-center gap-2 rounded border px-3 py-1.5 ${cls}`}>
                  <span className="font-mono text-sm">{l}.</span>
                  <span>{optionText(it, l)}</span>
                  {chosen && (
                    <span className="ml-auto rounded bg-slate-700 px-2 text-xs text-white">Your answer</span>
                  )}
                  {correct && (
                    <span className="rounded bg-green-700 px-2 text-xs text-white">Correct answer</span>
                  )}
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ol>
  );
}

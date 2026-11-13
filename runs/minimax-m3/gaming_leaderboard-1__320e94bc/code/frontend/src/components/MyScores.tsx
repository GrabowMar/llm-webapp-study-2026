import type { MyScoresResponse } from "../types";
import { formatDate, formatNumber } from "../lib/format";

interface Props {
  data: MyScoresResponse;
  onRefresh: () => void;
}

export default function MyScores({ data, onRefresh }: Props) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-xl shadow-slate-950/40">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-slate-100">Your submissions</h2>
        <button
          type="button"
          onClick={onRefresh}
          className="rounded-lg border border-slate-700 bg-slate-800/60 px-2.5 py-1 text-xs font-medium text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
        >
          Refresh
        </button>
      </div>

      <div className="mt-3 rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3">
        <span className="text-xs uppercase tracking-wider text-slate-500">Best score</span>
        <p className="mt-1 font-mono text-2xl font-bold text-amber-300">
          {data.best_score === null ? "—" : formatNumber(data.best_score)}
        </p>
      </div>

      <ul className="mt-4 divide-y divide-slate-800/70">
        {data.items.slice(0, 8).map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-3 py-2.5">
            <div>
              <p className="font-mono text-base font-semibold text-slate-100">
                {formatNumber(item.score)}
                {item.is_hidden ? (
                  <span className="ml-2 rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-400">
                    hidden
                  </span>
                ) : null}
              </p>
              <p className="text-xs text-slate-500">{formatDate(item.achieved_at)}</p>
            </div>
          </li>
        ))}
        {data.items.length === 0 ? (
          <li className="py-6 text-center text-sm text-slate-500">No submissions yet.</li>
        ) : null}
      </ul>
    </section>
  );
}

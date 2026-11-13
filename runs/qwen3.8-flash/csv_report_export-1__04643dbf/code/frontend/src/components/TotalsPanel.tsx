import type { Summary } from "../types";

export default function TotalsPanel({
  summary,
  loading,
}: {
  summary: Summary | null;
  loading: boolean;
}) {
  return (
    <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Totals per project
      </h2>
      {loading && !summary ? (
        <p className="mt-4 text-sm text-slate-400">Loading…</p>
      ) : summary && summary.items.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {summary.items.map((item) => (
            <li key={item.project} className="flex items-center justify-between text-sm">
              <span className="truncate pr-2 font-medium text-slate-700">
                {item.project}
              </span>
              <span className="whitespace-nowrap tabular-nums text-slate-500">
                {item.hours} h
              </span>
            </li>
          ))}
          <li className="flex items-center justify-between border-t border-slate-100 pt-2 text-sm font-semibold text-slate-800">
            <span>Total</span>
            <span className="tabular-nums">{summary.total_hours} h</span>
          </li>
        </ul>
      ) : (
        <p className="mt-4 text-sm text-slate-400">No hours logged for these filters.</p>
      )}
    </div>
  );
}

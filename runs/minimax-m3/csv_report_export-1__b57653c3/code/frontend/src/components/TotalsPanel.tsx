import type { SummaryItem } from "../types";

interface Props {
  items: SummaryItem[];
  loading: boolean;
}

function formatHours(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

export default function TotalsPanel({ items, loading }: Props) {
  const total = items.reduce((sum, item) => sum + item.hours, 0);
  const largest = items.reduce((max, item) => Math.max(max, item.hours), 0);

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Totals</h2>
        <p className="text-sm text-slate-500">
          {loading ? "Loading…" : `${formatHours(total)} h total`}
        </p>
      </div>

      {items.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No entries in this period yet.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {items.map((item) => (
            <li key={item.project}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate font-medium text-slate-700">{item.project}</span>
                <span className="tabular-nums text-slate-500">{formatHours(item.hours)} h</span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-indigo-500"
                  style={{ width: `${largest > 0 ? (item.hours / largest) * 100 : 0}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

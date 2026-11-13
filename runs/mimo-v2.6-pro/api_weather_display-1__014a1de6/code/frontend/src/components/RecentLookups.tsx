import { formatTime } from "../format";
import type { Lookup } from "../types";

interface RecentLookupsProps {
  lookups: Lookup[];
  onSelect: (city: string) => void;
}

export default function RecentLookups({ lookups, onSelect }: RecentLookupsProps) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Recent lookups</h2>
      {lookups.length === 0 ? (
        <p className="mt-3 text-slate-500">No lookups recorded yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100">
          {lookups.map((lookup) => (
            <li key={lookup.id}>
              <button
                type="button"
                onClick={() => onSelect(lookup.city)}
                className="flex w-full flex-wrap items-center justify-between gap-2 py-2 text-left hover:bg-sky-50"
              >
                <span className="font-medium text-slate-900">{lookup.city}</span>
                <span
                  className={
                    lookup.found
                      ? "text-sm text-emerald-600"
                      : "text-sm text-slate-400"
                  }
                >
                  {lookup.found ? "found" : "no data"}
                </span>
                <span className="text-sm text-slate-400">
                  {formatTime(lookup.looked_up_at)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

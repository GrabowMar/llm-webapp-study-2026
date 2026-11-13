import { formatTimestamp } from "../format";
import type { Lookup } from "../types";

interface RecentLookupsProps {
  lookups: Lookup[];
  onSelect: (city: string) => void;
}

export default function RecentLookups({ lookups, onSelect }: RecentLookupsProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Recent lookups</h2>
      <p className="mt-1 text-sm text-slate-500">The five most recent city searches.</p>

      {lookups.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No lookups yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100" data-testid="recent-lookups">
          {lookups.map((lookup) => (
            <li key={lookup.id}>
              <button
                type="button"
                onClick={() => onSelect(lookup.city)}
                className="flex w-full items-center justify-between gap-3 py-2 text-left transition hover:bg-slate-50"
              >
                <span className="font-medium text-slate-800">{lookup.city}</span>
                <span className="flex items-center gap-2 text-xs text-slate-500">
                  <span
                    className={`rounded-full px-2 py-0.5 font-semibold ${
                      lookup.found ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {lookup.found ? "found" : "no data"}
                  </span>
                  <span>{formatTimestamp(lookup.looked_up_at)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

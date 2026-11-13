import type { Lookup } from "../api";

interface Props {
  items: Lookup[];
  onPick: (city: string) => void;
}

export default function RecentLookups({ items, onPick }: Props) {
  return (
    <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <h2 className="text-lg font-semibold text-slate-900">Recent lookups</h2>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No lookups yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100">
          {items.map((lookup) => (
            <li key={lookup.id}>
              <button
                type="button"
                onClick={() => onPick(lookup.city)}
                className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-2.5 text-left hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                <span className="truncate text-sm font-medium text-slate-800">{lookup.city}</span>
                <span
                  className={
                    lookup.found
                      ? "shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700"
                      : "shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500"
                  }
                >
                  {lookup.found ? "Found" : "Not found"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

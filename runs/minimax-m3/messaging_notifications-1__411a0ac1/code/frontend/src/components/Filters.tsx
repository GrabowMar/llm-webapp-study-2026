import type { ReadFilter } from "../types";

export function Filters({
  readFilter,
  typeFilter,
  types,
  onReadFilterChange,
  onTypeFilterChange,
}: {
  readFilter: ReadFilter;
  typeFilter: string;
  types: string[];
  onReadFilterChange: (value: ReadFilter) => void;
  onTypeFilterChange: (value: string) => void;
}) {
  const selectClass =
    "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-slate-500">
        Read state
        <select
          className={selectClass}
          value={readFilter}
          onChange={(event) => onReadFilterChange(event.target.value as ReadFilter)}
        >
          <option value="all">All notifications</option>
          <option value="unread">Unread only</option>
          <option value="read">Read only</option>
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-slate-500">
        Type
        <select
          className={selectClass}
          value={typeFilter}
          onChange={(event) => onTypeFilterChange(event.target.value)}
        >
          <option value="">All types</option>
          {types.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

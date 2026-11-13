import { Link } from "react-router-dom";
import type { Sensor } from "../api";
import { formatValue, timeAgo } from "../format";

export default function SensorCard({
  sensor,
  canManage,
  onDelete,
  deleting,
}: {
  sensor: Sensor;
  canManage: boolean;
  onDelete: (sensor: Sensor) => void;
  deleting: boolean;
}) {
  return (
    <div className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            to={`/sensors/${sensor.id}`}
            className="block truncate text-base font-semibold text-slate-900 hover:text-emerald-600"
          >
            {sensor.name}
          </Link>
          <p className="mt-0.5 truncate text-sm text-slate-500">
            {sensor.location || "No location"}
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => onDelete(sensor)}
            disabled={deleting}
            title="Delete sensor"
            aria-label={`Delete ${sensor.name}`}
            className="rounded-lg border border-transparent p-1.5 text-slate-400 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
          >
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M8.75 1h2.5a1.25 1.25 0 0 1 1.25 1.25V3h3.25a.75.75 0 0 1 0 1.5h-.62l-.73 11.3A2.25 2.25 0 0 1 12.16 18H7.84a2.25 2.25 0 0 1-2.24-2.2L4.87 4.5H4.25a.75.75 0 0 1 0-1.5H7.5V2.25A1.25 1.25 0 0 1 8.75 1Zm-2.37 3.5.72 11.18a.75.75 0 0 0 .74.82h4.32a.75.75 0 0 0 .74-.82l.72-11.18H6.38ZM8.5 6.25a.75.75 0 0 1 .75.75v6a.75.75 0 0 1-1.5 0V7a.75.75 0 0 1 .75-.75Zm3 0a.75.75 0 0 1 .75.75v6a.75.75 0 0 1-1.5 0V7a.75.75 0 0 1 .75-.75Z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        )}
      </div>

      <div className="mt-5 flex items-end gap-1.5">
        <span className="text-4xl font-bold tracking-tight text-slate-900">
          {formatValue(sensor.last_value)}
        </span>
        {sensor.unit && (
          <span className="pb-1 text-sm font-medium text-slate-500">
            {sensor.unit}
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-slate-400">
        updated {timeAgo(sensor.last_updated)}
      </p>

      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
        <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
          <span className="grid h-5 w-5 place-items-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-600">
            {sensor.owner[0]?.toUpperCase()}
          </span>
          {sensor.owner}
        </span>
        <Link
          to={`/sensors/${sensor.id}`}
          className="text-xs font-semibold text-emerald-600 hover:text-emerald-700"
        >
          View history →
        </Link>
      </div>
    </div>
  );
}

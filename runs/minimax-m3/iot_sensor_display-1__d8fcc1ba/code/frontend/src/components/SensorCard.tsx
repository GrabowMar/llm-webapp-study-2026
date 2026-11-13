import { Link } from "react-router-dom";
import type { Sensor } from "../api";
import { formatValue } from "../format";
import TimeAgo from "./TimeAgo";

export default function SensorCard({ sensor }: { sensor: Sensor }) {
  return (
    <Link
      to={`/sensors/${sensor.id}`}
      className="group block rounded-2xl border border-slate-800 bg-slate-900/60 p-5 transition hover:-translate-y-0.5 hover:border-accent/60 hover:bg-slate-900"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-semibold text-slate-100 group-hover:text-accent">{sensor.name}</h3>
        <span className="shrink-0 rounded-full bg-slate-800 px-2.5 py-0.5 text-xs text-slate-400">
          {sensor.owner}
        </span>
      </div>

      <div className="mt-4 flex items-end gap-2">
        <span className="text-4xl font-semibold tabular-nums text-slate-50">
          {formatValue(sensor.last_value)}
        </span>
        <span className="pb-1 text-sm font-medium text-slate-400">{sensor.unit}</span>
      </div>

      <dl className="mt-4 space-y-1 border-t border-slate-800 pt-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-slate-500">Location</dt>
          <dd className="truncate text-slate-300">{sensor.location || "—"}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-slate-500">Updated</dt>
          <dd className="text-slate-300">
            <TimeAgo iso={sensor.last_updated} />
          </dd>
        </div>
      </dl>
    </Link>
  );
}

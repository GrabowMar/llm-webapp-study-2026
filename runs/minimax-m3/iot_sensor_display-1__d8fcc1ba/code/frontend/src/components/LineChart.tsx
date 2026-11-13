import { useMemo } from "react";
import type { Reading } from "../api";
import { formatClock } from "../format";

type Point = { t: number; v: number };

function compact(value: number): string {
  if (Math.abs(value) >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (Math.abs(value) >= 100) return value.toFixed(0);
  if (Math.abs(value) >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

export default function LineChart({
  readings,
  unit = "",
  height = "h-64",
}: {
  readings: Reading[];
  unit?: string;
  height?: string;
}) {
  const points: Point[] = useMemo(
    () =>
      readings
        .map((reading) => ({ t: new Date(reading.recorded_at).getTime(), v: reading.value }))
        .filter((point) => !Number.isNaN(point.t))
        .sort((a, b) => a.t - b.t),
    [readings],
  );

  if (points.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-900/40 text-sm text-slate-400">
        No readings recorded yet.
      </div>
    );
  }

  const values = points.map((point) => point.v);
  let minValue = Math.min(...values);
  let maxValue = Math.max(...values);
  if (minValue === maxValue) {
    const pad = Math.max(Math.abs(minValue) * 0.05, 0.5);
    minValue -= pad;
    maxValue += pad;
  }

  const times = points.map((point) => point.t);
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const timeSpan = maxTime - minTime || 60_000;

  const x = (t: number) => ((t - minTime) / timeSpan) * 100;
  const y = (v: number) => 100 - ((v - minValue) / (maxValue - minValue)) * 100;

  const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${x(point.t)} ${y(point.v)}`).join(" ");
  const areaPath = `${linePath} L ${x(points[points.length - 1].t)} 100 L ${x(points[0].t)} 100 Z`;

  const ticks = [0, 25, 50, 75, 100];

  return (
    <div className="w-full">
      <div className={`relative w-full pl-14 ${height}`}>
        {ticks.map((tick) => (
          <div
            key={tick}
            className="absolute left-0 w-12 -translate-y-1/2 text-right text-[11px] tabular-nums text-slate-500"
            style={{ top: `${tick}%` }}
          >
            {compact(maxValue - ((maxValue - minValue) * tick) / 100)}
          </div>
        ))}

        <div className="relative h-full w-full">
          <svg
            className="absolute inset-0 h-full w-full overflow-visible"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.35" />
                <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {ticks.map((tick) => (
              <line
                key={tick}
                x1="0"
                x2="100"
                y1={tick}
                y2={tick}
                stroke="currentColor"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
                className="text-slate-700/60"
              />
            ))}
            <path d={areaPath} fill="url(#chart-fill)" />
            <path
              d={linePath}
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          {points.map((point, index) => (
            <span
              key={index}
              className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent ring-2 ring-slate-900"
              style={{ left: `${x(point.t)}%`, top: `${y(point.v)}%` }}
              title={`${point.v}${unit ? ` ${unit}` : ""} — ${formatClock(new Date(point.t).toISOString())}`}
            />
          ))}
        </div>
      </div>

      <div className="mt-1 flex justify-between pl-14 text-[11px] tabular-nums text-slate-500">
        <span>{formatClock(new Date(minTime).toISOString())}</span>
        <span>{formatClock(new Date(maxTime).toISOString())}</span>
      </div>
    </div>
  );
}

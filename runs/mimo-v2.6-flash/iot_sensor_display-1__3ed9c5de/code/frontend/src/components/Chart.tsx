import type { Reading } from "../lib/api";
import { formatClock } from "../lib/time";

const W = 640;
const H = 260;
const PAD = { top: 16, right: 20, bottom: 36, left: 56 };

type Point = { t: number; v: number };

function axisNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(Math.abs(value) >= 100 ? 0 : 2);
}

export default function Chart({
  readings,
  unit,
}: {
  readings: Reading[];
  unit: string;
}) {
  const points: Point[] = readings
    .filter(
      (reading) =>
        typeof reading.value === "number" &&
        Number.isFinite(reading.value) &&
        !Number.isNaN(Date.parse(reading.recorded_at)),
    )
    .map((reading) => ({
      t: Date.parse(reading.recorded_at),
      v: reading.value as number,
    }))
    .sort((a, b) => a.t - b.t);

  if (points.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
        No numeric readings to chart yet.
      </div>
    );
  }

  const tMin = points[0].t;
  const tMax = points[points.length - 1].t;
  const values = points.map((point) => point.v);
  let vMin = Math.min(...values);
  let vMax = Math.max(...values);
  if (vMin === vMax) {
    const pad = Math.abs(vMin) * 0.1 || 1;
    vMin -= pad;
    vMax += pad;
  } else {
    const pad = (vMax - vMin) * 0.08;
    vMin -= pad;
    vMax += pad;
  }

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (t: number) =>
    tMax === tMin
      ? PAD.left + innerW / 2
      : PAD.left + ((t - tMin) / (tMax - tMin)) * innerW;
  const y = (v: number) =>
    PAD.top + (1 - (v - vMin) / (vMax - vMin)) * innerH;

  const line = points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${x(point.t).toFixed(1)},${y(point.v).toFixed(1)}`,
    )
    .join(" ");
  const area = `${line} L${x(tMax).toFixed(1)},${(H - PAD.bottom).toFixed(1)} L${x(tMin).toFixed(1)},${(H - PAD.bottom).toFixed(1)} Z`;

  const yTicks = [0, 1, 2, 3].map(
    (step) => vMin + (step / 3) * (vMax - vMin),
  );
  const xTicks = [tMin, (tMin + tMax) / 2, tMax];
  const showDots = points.length <= 60;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Readings over time${unit ? ` in ${unit}` : ""}`}
        className="h-auto w-full"
      >
        {yTicks.map((tick) => (
          <g key={`y-${tick}`}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(tick)}
              y2={y(tick)}
              className="stroke-slate-200"
              strokeWidth={1}
            />
            <text
              x={PAD.left - 8}
              y={y(tick) + 3}
              textAnchor="end"
              className="fill-slate-500 text-[10px]"
            >
              {axisNumber(tick)}
            </text>
          </g>
        ))}

        {xTicks.map((tick, index) => (
          <text
            key={`x-${index}`}
            x={x(tick)}
            y={H - PAD.bottom + 16}
            textAnchor={index === 0 ? "start" : index === 1 ? "middle" : "end"}
            className="fill-slate-500 text-[10px]"
          >
            {formatClock(new Date(tick).toISOString())}
          </text>
        ))}

        <path d={area} className="fill-sky-500/10" />
        <path
          d={line}
          fill="none"
          className="stroke-sky-500"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {showDots &&
          points.map((point, index) => (
            <circle
              key={`${point.t}-${index}`}
              cx={x(point.t)}
              cy={y(point.v)}
              r={2.5}
              className="fill-sky-600"
            />
          ))}
      </svg>
    </div>
  );
}

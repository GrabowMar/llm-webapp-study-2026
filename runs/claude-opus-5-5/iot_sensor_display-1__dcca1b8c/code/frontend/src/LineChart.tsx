import { useMemo, useRef, useState, type MouseEvent } from "react";
import type { Reading } from "./api";
import { formatDateTime, formatValue } from "./hooks";

const W = 720;
const H = 280;
const PAD = { top: 16, right: 20, bottom: 36, left: 56 };

function niceTicks(min: number, max: number, count = 5): number[] {
  if (min === max) {
    const d = Math.abs(min) * 0.1 || 1;
    min -= d;
    max += d;
  }
  const raw = (max - min) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Number(v.toPrecision(12)));
  return ticks;
}

function formatTime(t: number, spanMs: number): string {
  const d = new Date(t);
  if (spanMs > 2 * 24 * 3600 * 1000) return d.toLocaleDateString([], { month: "short", day: "numeric" });
  if (spanMs > 3600 * 1000) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function LineChart({ readings, unit }: { readings: Reading[]; unit: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const points = useMemo(
    () =>
      readings
        .map((r) => ({ t: Date.parse(r.recorded_at), v: r.value, r }))
        .filter((p) => !Number.isNaN(p.t))
        .sort((a, b) => a.t - b.t || a.r.id - b.r.id),
    [readings],
  );

  if (points.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-slate-300 text-sm text-slate-500">
        No readings yet
      </div>
    );
  }

  const values = points.map((p) => p.v);
  const yTicks = niceTicks(Math.min(...values), Math.max(...values));
  const yMin = yTicks[0];
  const yMax = yTicks[yTicks.length - 1];
  let tMin = points[0].t;
  let tMax = points[points.length - 1].t;
  if (tMin === tMax) {
    tMin -= 30000;
    tMax += 30000;
  }
  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;
  const x = (t: number) => PAD.left + ((t - tMin) / (tMax - tMin)) * iw;
  const y = (v: number) => PAD.top + ih - ((v - yMin) / (yMax - yMin || 1)) * ih;

  const path = points.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const area = `${path} L${x(points[points.length - 1].t).toFixed(1)},${PAD.top + ih} L${x(points[0].t).toFixed(1)},${PAD.top + ih} Z`;
  const xTickCount = Math.min(6, points.length > 1 ? 6 : 1);
  const xTicks = Array.from({ length: xTickCount }, (_, i) =>
    xTickCount === 1 ? (tMin + tMax) / 2 : tMin + ((tMax - tMin) * i) / (xTickCount - 1),
  );

  const onMove = (e: MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    let bestD = Infinity;
    points.forEach((p, i) => {
      const d = Math.abs(x(p.t) - px);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    setHover(best);
  };

  const hp = hover !== null ? points[hover] : null;

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full select-none"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label="Line chart of recent readings"
      >
        <defs>
          <linearGradient id="area-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgb(79 70 229)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="rgb(79 70 229)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} className="stroke-slate-200" />
            <text x={PAD.left - 8} y={y(v)} textAnchor="end" dominantBaseline="middle" className="fill-slate-500 text-[11px]">
              {formatValue(v)}
            </text>
          </g>
        ))}
        {xTicks.map((t, i) => (
          <text
            key={i}
            x={x(t)}
            y={H - PAD.bottom + 18}
            textAnchor={xTickCount === 1 ? "middle" : i === 0 ? "start" : i === xTickCount - 1 ? "end" : "middle"}
            className="fill-slate-500 text-[11px]"
          >
            {formatTime(t, tMax - tMin)}
          </text>
        ))}
        {unit && (
          <text x={PAD.left} y={PAD.top - 4} className="fill-slate-400 text-[10px]">
            {unit}
          </text>
        )}
        <path d={area} fill="url(#area-fill)" />
        <path d={path} fill="none" className="stroke-indigo-600" strokeWidth={2} strokeLinejoin="round" />
        {points.length <= 60 &&
          points.map((p) => (
            <circle key={p.r.id} cx={x(p.t)} cy={y(p.v)} r={3} className="fill-white stroke-indigo-600" strokeWidth={1.5} />
          ))}
        {hp && (
          <g>
            <line x1={x(hp.t)} x2={x(hp.t)} y1={PAD.top} y2={PAD.top + ih} className="stroke-slate-400" strokeDasharray="4 3" />
            <circle cx={x(hp.t)} cy={y(hp.v)} r={5} className="fill-indigo-600 stroke-white" strokeWidth={2} />
          </g>
        )}
      </svg>
      {hp && (
        <div
          className="pointer-events-none absolute top-2 rounded-md bg-slate-900 px-2 py-1 text-xs text-white shadow"
          style={{
            left: `${(x(hp.t) / W) * 100}%`,
            transform: x(hp.t) > W / 2 ? "translateX(calc(-100% - 8px))" : "translateX(8px)",
          }}
        >
          <div className="font-semibold">
            {formatValue(hp.v)} {unit}
          </div>
          <div className="text-slate-300">{formatDateTime(hp.r.recorded_at)}</div>
        </div>
      )}
    </div>
  );
}

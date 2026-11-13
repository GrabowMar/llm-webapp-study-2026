import type { Reading } from "./api";
import { formatValue } from "./api";

export default function Chart({ readings, unit }: { readings: Reading[]; unit: string }) {
  if (readings.length === 0) {
    return <p className="text-sm text-slate-500">No readings yet.</p>;
  }
  const pts = [...readings].reverse();
  const W = 640;
  const H = 240;
  const pad = { l: 48, r: 16, t: 12, b: 28 };
  const times = pts.map((p) => new Date(p.recorded_at).getTime());
  const vals = pts.map((p) => p.value);
  const tMin = Math.min(...times);
  const tMax = Math.max(...times);
  let vMin = Math.min(...vals);
  let vMax = Math.max(...vals);
  if (vMin === vMax) {
    vMin -= 1;
    vMax += 1;
  }
  const x = (i: number) =>
    tMax === tMin
      ? pad.l + (W - pad.l - pad.r) / 2
      : pad.l + ((times[i] - tMin) / (tMax - tMin)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - vMin) / (vMax - vMin)) * (H - pad.t - pad.b);
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const ticks = [vMin, (vMin + vMax) / 2, vMax];
  const fmt = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Line chart of recent readings${unit ? ` in ${unit}` : ""}`}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="stroke-slate-200" />
          <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" className="fill-slate-500 text-[11px]">
            {formatValue(Math.round(t * 100) / 100)}
          </text>
        </g>
      ))}
      <text x={pad.l} y={H - 8} className="fill-slate-500 text-[11px]">
        {fmt(tMin)}
      </text>
      <text x={W - pad.r} y={H - 8} textAnchor="end" className="fill-slate-500 text-[11px]">
        {fmt(tMax)}
      </text>
      <path d={path} fill="none" className="stroke-blue-600" strokeWidth={2} strokeLinejoin="round" />
      {pts.map((p, i) => (
        <circle key={p.id} cx={x(i)} cy={y(p.value)} r={3} className="fill-blue-600">
          <title>{`${formatValue(p.value)} ${unit} at ${new Date(p.recorded_at).toLocaleString()}`}</title>
        </circle>
      ))}
    </svg>
  );
}

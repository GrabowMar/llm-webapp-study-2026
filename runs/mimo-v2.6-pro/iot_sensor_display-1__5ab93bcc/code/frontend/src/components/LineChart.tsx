import { formatTimestamp } from "../format";

interface Point {
  t: number;
  v: number;
}

export default function LineChart({ points, unit }: { points: Point[]; unit: string }) {
  if (points.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500">
        No readings to chart yet.
      </div>
    );
  }

  const width = 640;
  const height = 240;
  const padX = 56;
  const padY = 28;
  const values = points.map((p) => p.v);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const times = points.map((p) => p.t);
  const tMin = Math.min(...times);
  const tMax = Math.max(...times);
  const spanT = tMax - tMin || 1;

  const x = (t: number) => padX + ((t - tMin) / spanT) * (width - 2 * padX);
  const y = (v: number) => height - padY - ((v - min) / (max - min)) * (height - 2 * padY);

  const coords = points.map((p) => `${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`);
  const line = coords.join(" ");

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-64 w-full"
        role="img"
        aria-label="Recent readings line chart"
      >
        <line x1={padX} y1={height - padY} x2={width - padX} y2={height - padY} stroke="#cbd5e1" />
        <line x1={padX} y1={padY} x2={padX} y2={height - padY} stroke="#cbd5e1" />
        <text x={padX - 8} y={padY + 4} textAnchor="end" className="fill-slate-500 text-xs">
          {Number(max.toFixed(2))}
        </text>
        <text x={padX - 8} y={height - padY + 4} textAnchor="end" className="fill-slate-500 text-xs">
          {Number(min.toFixed(2))}
        </text>
        <text x={padX} y={height - 8} textAnchor="start" className="fill-slate-500 text-xs">
          {formatTimestamp(new Date(tMin).toISOString())}
        </text>
        <text x={width - padX} y={height - 8} textAnchor="end" className="fill-slate-500 text-xs">
          {formatTimestamp(new Date(tMax).toISOString())}
        </text>
        {points.length > 1 ? (
          <polyline points={line} fill="none" stroke="#4f46e5" strokeWidth={2} />
        ) : null}
        {points.map((p, i) => (
          <circle key={i} cx={x(p.t)} cy={y(p.v)} r={3} fill="#4f46e5" />
        ))}
        {unit ? (
          <text x={width - padX} y={padY + 4} textAnchor="end" className="fill-slate-500 text-xs">
            {unit}
          </text>
        ) : null}
      </svg>
    </div>
  );
}

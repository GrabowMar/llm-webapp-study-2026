import type { Store } from "../types";

interface Props {
  stores: Store[];
  visitor: { lat: number; lng: number } | null;
}

interface Point {
  key: string;
  lat: number;
  lng: number;
  label: string;
  visitor: boolean;
}

const WIDTH = 640;
const HEIGHT = 420;
const MARGIN = 48;

export default function StorePlot({ stores, visitor }: Props) {
  const points: Point[] = stores.map((s) => ({
    key: `store-${s.id}`,
    lat: s.latitude,
    lng: s.longitude,
    label: s.name,
    visitor: false,
  }));
  if (visitor !== null) {
    points.push({ key: "visitor", lat: visitor.lat, lng: visitor.lng, label: "You are here", visitor: true });
  }

  if (points.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">
        Nothing to plot yet.
      </div>
    );
  }

  const midLat = (Math.min(...points.map((p) => p.lat)) + Math.max(...points.map((p) => p.lat))) / 2;
  const kx = Math.cos((midLat * Math.PI) / 180) || 1;
  const xs = points.map((p) => p.lng * kx);
  const ys = points.map((p) => p.lat);
  const padX = (Math.max(...xs) - Math.min(...xs)) * 0.12 || 1;
  const padY = (Math.max(...ys) - Math.min(...ys)) * 0.12 || 1;
  const minX = Math.min(...xs) - padX;
  const maxX = Math.max(...xs) + padX;
  const minY = Math.min(...ys) - padY;
  const maxY = Math.max(...ys) + padY;

  const px = (p: Point) => MARGIN + ((p.lng * kx - minX) / (maxX - minX)) * (WIDTH - 2 * MARGIN);
  const py = (p: Point) => HEIGHT - MARGIN - ((p.lat - minY) / (maxY - minY)) * (HEIGHT - 2 * MARGIN);

  const ticks = 4;
  const xTicks = Array.from({ length: ticks + 1 }, (_, i) => {
    const value = minX + (i / ticks) * (maxX - minX);
    return { x: MARGIN + (i / ticks) * (WIDTH - 2 * MARGIN), value: value / kx };
  });
  const yTicks = Array.from({ length: ticks + 1 }, (_, i) => {
    const value = minY + (i / ticks) * (maxY - minY);
    return { y: HEIGHT - MARGIN - (i / ticks) * (HEIGHT - 2 * MARGIN), value };
  });

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">Store map</h2>
      <p className="mt-0.5 text-xs text-slate-500">
        Plotted by latitude and longitude, drawn from the page itself — no external map tiles.
      </p>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="mt-2 h-auto w-full"
        role="img"
        aria-label="Scatter plot of store positions"
      >
        <rect x={MARGIN} y={MARGIN} width={WIDTH - 2 * MARGIN} height={HEIGHT - 2 * MARGIN} fill="#f8fafc" stroke="#e2e8f0" />
        {xTicks.map((t) => (
          <g key={`x${t.x}`}>
            <line x1={t.x} y1={MARGIN} x2={t.x} y2={HEIGHT - MARGIN} stroke="#e2e8f0" />
            <text x={t.x} y={HEIGHT - MARGIN + 16} textAnchor="middle" className="fill-slate-500 text-[10px]">
              {t.value.toFixed(1)}°
            </text>
          </g>
        ))}
        {yTicks.map((t) => (
          <g key={`y${t.y}`}>
            <line x1={MARGIN} y1={t.y} x2={WIDTH - MARGIN} y2={t.y} stroke="#e2e8f0" />
            <text x={MARGIN - 8} y={t.y + 3} textAnchor="end" className="fill-slate-500 text-[10px]">
              {t.value.toFixed(1)}°
            </text>
          </g>
        ))}
        <text x={WIDTH / 2} y={HEIGHT - 10} textAnchor="middle" className="fill-slate-400 text-[10px]">
          longitude
        </text>
        <text x={12} y={HEIGHT / 2} textAnchor="middle" transform={`rotate(-90 12 ${HEIGHT / 2})`} className="fill-slate-400 text-[10px]">
          latitude
        </text>
        {points.map((p) => (
          <g key={p.key}>
            <circle
              cx={px(p)}
              cy={py(p)}
              r={p.visitor ? 8 : 6}
              className={p.visitor ? "fill-amber-500 stroke-white" : "fill-indigo-600"}
              strokeWidth={p.visitor ? 2 : 0}
            />
            <text
              x={px(p) + 10}
              y={py(p) + 4}
              className={p.visitor ? "fill-amber-700 text-[11px] font-semibold" : "fill-slate-700 text-[11px]"}
            >
              {p.label}
            </text>
          </g>
        ))}
      </svg>
      <div className="mt-1 flex gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-indigo-600" /> Store
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" /> Visitor
        </span>
      </div>
    </div>
  );
}

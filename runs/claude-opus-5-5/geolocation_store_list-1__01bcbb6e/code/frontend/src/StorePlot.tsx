import type { Store } from "./api";

type Props = {
  stores: Store[];
  visitor: { lat: number; lng: number } | null;
  selectedId: number | null;
  onSelect: (id: number) => void;
};

const W = 600;
const H = 360;
const PAD = 28;

export default function StorePlot({ stores, visitor, selectedId, onSelect }: Props) {
  const points = stores.map((s) => ({ lat: s.latitude, lng: s.longitude }));
  if (visitor) points.push(visitor);

  if (points.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white text-sm text-slate-500">
        Nothing to plot.
      </div>
    );
  }

  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  let minLat = Math.min(...lats);
  let maxLat = Math.max(...lats);
  let minLng = Math.min(...lngs);
  let maxLng = Math.max(...lngs);
  const midLat = (minLat + maxLat) / 2;
  const kx = Math.max(Math.cos((midLat * Math.PI) / 180), 0.05);

  const minSpan = 0.01;
  if (maxLat - minLat < minSpan) {
    minLat -= minSpan / 2;
    maxLat += minSpan / 2;
  }
  if ((maxLng - minLng) * kx < minSpan) {
    minLng -= minSpan / kx / 2;
    maxLng += minSpan / kx / 2;
  }

  const spanX = (maxLng - minLng) * kx;
  const spanY = maxLat - minLat;
  const scale = Math.min((W - 2 * PAD) / spanX, (H - 2 * PAD) / spanY);
  const offX = (W - spanX * scale) / 2;
  const offY = (H - spanY * scale) / 2;
  const project = (lat: number, lng: number) => ({
    x: offX + (lng - minLng) * kx * scale,
    y: H - (offY + (lat - minLat) * scale),
  });

  const grid = [0.25, 0.5, 0.75];

  return (
    <figure className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full"
        role="img"
        aria-label="Plot of store locations by latitude and longitude"
      >
        <rect x={0} y={0} width={W} height={H} className="fill-slate-50" />
        {grid.map((t) => (
          <g key={t} className="stroke-slate-200">
            <line x1={W * t} y1={0} x2={W * t} y2={H} />
            <line x1={0} y1={H * t} x2={W} y2={H * t} />
          </g>
        ))}
        {visitor &&
          (() => {
            const p = project(visitor.lat, visitor.lng);
            return (
              <g>
                <circle cx={p.x} cy={p.y} r={11} className="fill-emerald-200/60" />
                <circle cx={p.x} cy={p.y} r={6} className="fill-emerald-600 stroke-white" strokeWidth={2} />
                <title>You are here</title>
              </g>
            );
          })()}
        {stores.map((s) => {
          const p = project(s.latitude, s.longitude);
          const active = s.id === selectedId;
          return (
            <g
              key={s.id}
              className="cursor-pointer"
              onClick={() => onSelect(s.id)}
              tabIndex={0}
              role="button"
              aria-label={s.name}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(s.id);
                }
              }}
            >
              <title>
                {s.name}
                {s.distance_km != null ? ` (${s.distance_km.toFixed(1)} km)` : ""}
              </title>
              <circle
                cx={p.x}
                cy={p.y}
                r={active ? 8 : 6}
                className={active ? "fill-orange-500 stroke-white" : "fill-blue-600 stroke-white"}
                strokeWidth={2}
              />
              {active && (
                <text x={p.x + 10} y={p.y - 10} className="fill-slate-800 text-[13px] font-medium">
                  {s.name}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <figcaption className="flex flex-wrap gap-4 border-t border-slate-200 px-3 py-2 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-600" /> Store
        </span>
        {visitor && (
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-600" /> You
          </span>
        )}
        <span>
          Lat {minLat.toFixed(2)}…{maxLat.toFixed(2)}, Lng {minLng.toFixed(2)}…{maxLng.toFixed(2)}
        </span>
      </figcaption>
    </figure>
  );
}

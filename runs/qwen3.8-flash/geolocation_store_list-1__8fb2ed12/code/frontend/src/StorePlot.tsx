import type { Store } from "./api";

const SIZE = 420;
const PAD = 28;

interface Props {
  stores: Store[];
  visitor: { lat: number; lng: number } | null;
}

export function StorePlot({ stores, visitor }: Props) {
  const points: { lat: number; lng: number; store: Store | null }[] = stores.map(
    (s) => ({ lat: s.latitude, lng: s.longitude, store: s }),
  );
  if (visitor) points.push({ lat: visitor.lat, lng: visitor.lng, store: null });

  if (points.length === 0) {
    return (
      <div className="flex aspect-square items-center justify-center rounded-md bg-slate-50 text-sm text-slate-400">
        Nothing to plot yet.
      </div>
    );
  }

  let minLat = Math.min(...points.map((p) => p.lat));
  let maxLat = Math.max(...points.map((p) => p.lat));
  let minLng = Math.min(...points.map((p) => p.lng));
  let maxLng = Math.max(...points.map((p) => p.lng));
  const latSpan = Math.max(maxLat - minLat, 0.002);
  const lngSpan = Math.max(maxLng - minLng, 0.002);
  const span = Math.max(latSpan, lngSpan);
  const cLat = (minLat + maxLat) / 2;
  const cLng = (minLng + maxLng) / 2;
  minLat = cLat - span / 2;
  maxLat = cLat + span / 2;
  minLng = cLng - span / 2;
  maxLng = cLng + span / 2;

  const scale = (SIZE - 2 * PAD) / span;
  const x = (lng: number) => PAD + (lng - minLng) * scale;
  const y = (lat: number) => SIZE - PAD - (lat - minLat) * scale;

  const ticks = 4;
  const gridLines = Array.from({ length: ticks + 1 }, (_, i) => {
    const t = i / ticks;
    return {
      gx: PAD + t * (SIZE - 2 * PAD),
      gy: PAD + t * (SIZE - 2 * PAD),
      lng: minLng + t * (maxLng - minLng),
      lat: maxLat - t * (maxLat - minLat),
    };
  });

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="aspect-square w-full rounded-md bg-slate-50"
      role="img"
      aria-label="Plot of stores by latitude and longitude"
    >
      {gridLines.map((g, i) => (
        <g key={i} stroke="#cbd5e1" strokeWidth={i === 0 || i === ticks ? 1 : 0.5}>
          <line x1={g.gx} y1={PAD} x2={g.gx} y2={SIZE - PAD} />
          <line x1={PAD} y1={g.gy} x2={SIZE - PAD} y2={g.gy} />
        </g>
      ))}
      {gridLines.map((g, i) =>
        i % 2 === 0 ? (
          <g key={`lbl-${i}`} fill="#94a3b8" fontSize={9}>
            <text x={g.gx} y={SIZE - PAD + 12} textAnchor="middle">
              {g.lng.toFixed(1)}°
            </text>
            <text x={PAD - 4} y={g.gy + 3} textAnchor="end">
              {g.lat.toFixed(1)}°
            </text>
          </g>
        ) : null,
      )}
      <rect
        x={PAD}
        y={PAD}
        width={SIZE - 2 * PAD}
        height={SIZE - 2 * PAD}
        fill="none"
        stroke="#94a3b8"
      />
      {points.map((p, i) =>
        p.store ? (
          <g key={p.store.id}>
            <circle cx={x(p.lng)} cy={y(p.lat)} r={5} fill="#0ea5e9">
              <title>{`${p.store.name} (${p.lat}, ${p.lng})`}</title>
            </circle>
            <text
              x={x(p.lng) + 7}
              y={y(p.lat) + 3}
              fontSize={9}
              fill="#334155"
            >
              {p.store.name.length > 18
                ? p.store.name.slice(0, 17) + "…"
                : p.store.name}
            </text>
          </g>
        ) : (
          <g key={`v-${i}`}>
            <circle cx={x(p.lng)} cy={y(p.lat)} r={6} fill="#f43f5e" stroke="#fff" strokeWidth={2}>
              <title>You ({p.lat}, {p.lng})</title>
            </circle>
          </g>
        ),
      )}
    </svg>
  );
}

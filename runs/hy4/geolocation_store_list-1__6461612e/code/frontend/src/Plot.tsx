import type { Store } from "./api";

type Props = {
  stores: Store[];
  visitor: { lat: number; lng: number } | null;
};

const W = 640;
const H = 420;
const PAD = 44;

export default function Plot({ stores, visitor }: Props) {
  const points = stores.map((s) => ({ lat: s.latitude, lng: s.longitude, store: s }));
  const all = points.map((p) => ({ lat: p.lat, lng: p.lng }));
  if (visitor) all.push({ lat: visitor.lat, lng: visitor.lng });

  if (all.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-500">
        No locations to plot yet.
      </div>
    );
  }

  const lats = all.map((p) => p.lat);
  const lngs = all.map((p) => p.lng);
  let minLat = Math.min(...lats), maxLat = Math.max(...lats);
  let minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  if (maxLat - minLat < 0.02) { minLat -= 0.01; maxLat += 0.01; }
  if (maxLng - minLng < 0.02) { minLng -= 0.01; maxLng += 0.01; }
  const spanLat = maxLat - minLat;
  const spanLng = maxLng - minLng;

  const x = (lng: number) => PAD + ((lng - minLng) / spanLng) * (W - 2 * PAD);
  const y = (lat: number) => H - PAD - ((lat - minLat) / spanLat) * (H - 2 * PAD);

  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => minLng + f * spanLng);
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => minLat + f * spanLat);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full rounded-lg border border-slate-200 bg-white" role="img" aria-label="Map of listed stores by latitude and longitude">
        <rect x={PAD} y={PAD} width={W - 2 * PAD} height={H - 2 * PAD} fill="#f8fafc" stroke="#e2e8f0" />
        {xTicks.map((lng, i) => (
          <g key={`x${i}`}>
            <line x1={x(lng)} y1={PAD} x2={x(lng)} y2={H - PAD} stroke="#e2e8f0" strokeDasharray="3 4" />
            <text x={x(lng)} y={H - PAD + 16} textAnchor="middle" fontSize="10" fill="#64748b">{lng.toFixed(2)}°</text>
          </g>
        ))}
        {yTicks.map((lat, i) => (
          <g key={`y${i}`}>
            <line x1={PAD} y1={y(lat)} x2={W - PAD} y2={y(lat)} stroke="#e2e8f0" strokeDasharray="3 4" />
            <text x={PAD - 8} y={y(lat) + 3} textAnchor="end" fontSize="10" fill="#64748b">{lat.toFixed(2)}°</text>
          </g>
        ))}
        <text x={W / 2} y={H - 6} textAnchor="middle" fontSize="11" fill="#94a3b8">longitude →</text>
        <text x={12} y={H / 2} textAnchor="middle" fontSize="11" fill="#94a3b8" transform={`rotate(-90 12 ${H / 2})`}>latitude →</text>
        {visitor && (
          <g>
            <circle cx={x(visitor.lng)} cy={y(visitor.lat)} r="12" fill="#3b82f6" opacity="0.15" />
            <circle cx={x(visitor.lng)} cy={y(visitor.lat)} r="6" fill="#2563eb" stroke="white" strokeWidth="2" />
            <text x={x(visitor.lng) + 10} y={y(visitor.lat) + 4} fontSize="11" fontWeight="600" fill="#1d4ed8">You</text>
          </g>
        )}
        {points.map((p) => (
          <g key={p.store.id}>
            <circle cx={x(p.lng)} cy={y(p.lat)} r="6" fill="#e11d48" stroke="white" strokeWidth="2" />
            <title>{p.store.name} ({p.lat.toFixed(3)}, {p.lng.toFixed(3)})</title>
          </g>
        ))}
      </svg>
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-rose-600" /> Store</span>
        {visitor && <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-blue-600" /> Your location</span>}
        <span className="text-slate-400">Positions are plotted directly from latitude / longitude.</span>
      </div>
    </div>
  );
}

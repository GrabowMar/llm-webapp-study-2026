import type { Store, LatLng } from "./types";

interface PlotProps {
  stores: Store[];
  visitor: LatLng | null;
}

export default function Plot({ stores, visitor }: PlotProps) {
  const width = 640;
  const height = 360;
  const pad = 40;

  const points: LatLng[] = stores.map((s) => ({ lat: s.latitude, lng: s.longitude }));
  if (visitor) points.push(visitor);

  if (points.length === 0) {
    return (
      <div className="flex h-[360px] items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-400">
        No stores to plot.
      </div>
    );
  }

  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const latSpan = maxLat - minLat || 0.01;
  const lngSpan = maxLng - minLng || 0.01;

  const padX = pad;
  const padY = pad;
  const plotW = width - pad * 2;
  const plotH = height - pad * 2;

  function x(lng: number): number {
    return padX + ((lng - minLng) / lngSpan) * plotW;
  }
  function y(lat: number): number {
    return padY + (1 - (lat - minLat) / latSpan) * plotH;
  }

  const ticks = 5;
  const latTicks: number[] = [];
  const lngTicks: number[] = [];
  for (let i = 0; i <= ticks; i++) {
    latTicks.push(minLat + (latSpan * i) / ticks);
    lngTicks.push(minLng + (lngSpan * i) / ticks);
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full rounded-lg border border-slate-200 bg-slate-50"
      role="img"
      aria-label="Map of stores"
    >
      {latTicks.map((t) => (
        <g key={`lat-${t}`}>
          <line
            x1={padX}
            x2={width - padX}
            y1={y(t)}
            y2={y(t)}
            stroke="#e2e8f0"
            strokeWidth="1"
          />
          <text x={padX - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill="#94a3b8">
            {t.toFixed(2)}
          </text>
        </g>
      ))}
      {lngTicks.map((t) => (
        <g key={`lng-${t}`}>
          <line
            x1={x(t)}
            x2={x(t)}
            y1={padY}
            y2={height - padY}
            stroke="#e2e8f0"
            strokeWidth="1"
          />
          <text x={x(t)} y={height - padY + 14} textAnchor="middle" fontSize="10" fill="#94a3b8">
            {t.toFixed(2)}
          </text>
        </g>
      ))}

      {visitor && (
        <g>
          <circle cx={x(visitor.lng)} cy={y(visitor.lat)} r="7" fill="#4f46e5" stroke="#ffffff" strokeWidth="2" />
          <circle cx={x(visitor.lng)} cy={y(visitor.lat)} r="12" fill="none" stroke="#4f46e5" strokeWidth="1.5" opacity="0.4" />
        </g>
      )}

      {stores.map((s) => (
        <g key={s.id}>
          <circle cx={x(s.longitude)} cy={y(s.latitude)} r="5" fill="#ea580c" stroke="#ffffff" strokeWidth="1.5" />
          <text x={x(s.longitude)} y={y(s.latitude) - 8} textAnchor="middle" fontSize="10" fill="#334155">
            {s.name}
          </text>
        </g>
      ))}
    </svg>
  );
}

import type { GeoPoint, Store } from "../api";

interface PlotPoint {
  lat: number;
  lng: number;
  label: string;
  visitor: boolean;
}

interface StorePlotProps {
  stores: Store[];
  position: GeoPoint | null;
}

const WIDTH = 640;
const HEIGHT = 420;
const PAD = 48;

export default function StorePlot({ stores, position }: StorePlotProps) {
  const points: PlotPoint[] = stores.map((store) => ({
    lat: store.latitude,
    lng: store.longitude,
    label: store.name,
    visitor: false,
  }));
  if (position) {
    points.push({ lat: position.lat, lng: position.lng, label: "You", visitor: true });
  }

  if (points.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
        Nothing to plot yet.
      </div>
    );
  }

  let minLat = Math.min(...points.map((p) => p.lat));
  let maxLat = Math.max(...points.map((p) => p.lat));
  let minLng = Math.min(...points.map((p) => p.lng));
  let maxLng = Math.max(...points.map((p) => p.lng));
  const midLat = (minLat + maxLat) / 2;
  const lonScale = Math.max(0.1, Math.cos((midLat * Math.PI) / 180));

  const latPad = Math.max((maxLat - minLat) * 0.15, 0.05);
  const lngPad = Math.max((maxLng - minLng) * 0.15, 0.05 / lonScale);
  minLat -= latPad;
  maxLat += latPad;
  minLng -= lngPad;
  maxLng += lngPad;

  const innerWidth = WIDTH - PAD * 2;
  const innerHeight = HEIGHT - PAD * 2;

  const project = (lat: number, lng: number) => {
    const x = PAD + ((lng - minLng) / (maxLng - minLng)) * innerWidth;
    const y = PAD + ((maxLat - lat) / (maxLat - minLat)) * innerHeight;
    return { x, y };
  };

  const gridLines = [0.25, 0.5, 0.75].map((t) => ({
    x: PAD + t * innerWidth,
    y: PAD + t * innerHeight,
  }));

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Store plot</h2>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
            Store
          </span>
          {position && (
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-600" />
              You
            </span>
          )}
        </div>
      </div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="Plot of listed stores by latitude and longitude"
        className="block h-auto w-full bg-slate-50"
      >
        {gridLines.map((line) => (
          <g key={`grid-${line.x}-${line.y}`} stroke="#e2e8f0" strokeWidth="1">
            <line x1={line.x} y1={PAD} x2={line.x} y2={HEIGHT - PAD} />
            <line x1={PAD} y1={line.y} x2={WIDTH - PAD} y2={line.y} />
          </g>
        ))}
        <rect
          x={PAD}
          y={PAD}
          width={innerWidth}
          height={innerHeight}
          fill="none"
          stroke="#cbd5e1"
          strokeWidth="1.5"
        />
        <text x={PAD} y={HEIGHT - 14} fontSize="11" fill="#64748b">
          {minLng.toFixed(2)}°
        </text>
        <text x={WIDTH - PAD} y={HEIGHT - 14} fontSize="11" fill="#64748b" textAnchor="end">
          {maxLng.toFixed(2)}°
        </text>
        <text x={10} y={PAD + 4} fontSize="11" fill="#64748b">
          {maxLat.toFixed(2)}°
        </text>
        <text x={10} y={HEIGHT - PAD} fontSize="11" fill="#64748b">
          {minLat.toFixed(2)}°
        </text>

        {points.map((point, index) => {
          const { x, y } = project(point.lat, point.lng);
          const anchorEnd = x > WIDTH - PAD - 90;
          return (
            <g key={`${point.label}-${index}`}>
              <circle
                cx={x}
                cy={y}
                r={point.visitor ? 8 : 6}
                fill={point.visitor ? "#2563eb" : "#10b981"}
                stroke="#ffffff"
                strokeWidth="2"
              >
                <title>{`${point.label} (${point.lat.toFixed(4)}, ${point.lng.toFixed(4)})`}</title>
              </circle>
              <text
                x={anchorEnd ? x - 10 : x + 10}
                y={y + 4}
                fontSize="11"
                textAnchor={anchorEnd ? "end" : "start"}
                fill={point.visitor ? "#1d4ed8" : "#334155"}
                fontWeight={point.visitor ? 600 : 500}
              >
                {point.label}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="border-t border-slate-200 px-4 py-2 text-xs text-slate-500">
        Positions are drawn from latitude and longitude; no map tiles are loaded.
      </p>
    </div>
  );
}

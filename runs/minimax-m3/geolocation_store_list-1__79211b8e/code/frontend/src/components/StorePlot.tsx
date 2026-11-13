import type { Coords, Store } from "../types";

type StorePlotProps = {
  stores: Store[];
  visitor: Coords | null;
};

const WIDTH = 720;
const HEIGHT = 420;
const PADDING = 44;

type Projected = {
  x: number;
  y: number;
  label: string;
  kind: "store" | "visitor";
};

export default function StorePlot({ stores, visitor }: StorePlotProps) {
  const points: Projected[] = [];

  if (stores.length === 0 && !visitor) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white text-sm text-slate-500">
        Nothing to plot yet.
      </div>
    );
  }

  const raw = [
    ...stores.map((store) => ({
      lat: store.latitude,
      lng: store.longitude,
      label: store.name,
      kind: "store" as const,
    })),
    ...(visitor
      ? [{ lat: visitor.lat, lng: visitor.lng, label: "You are here", kind: "visitor" as const }]
      : []),
  ];

  const midLat = raw.reduce((total, point) => total + point.lat, 0) / raw.length;
  const lngFactor = Math.cos((midLat * Math.PI) / 180) || 1;

  const projected = raw.map((point) => ({
    ...point,
    x: point.lng * lngFactor,
    y: point.lat,
  }));

  const xs = projected.map((point) => point.x);
  const ys = projected.map((point) => point.y);
  let minX = Math.min(...xs);
  let maxX = Math.max(...xs);
  let minY = Math.min(...ys);
  let maxY = Math.max(...ys);

  if (maxX - minX < 1e-6) {
    minX -= 0.01;
    maxX += 0.01;
  }
  if (maxY - minY < 1e-6) {
    minY -= 0.01;
    maxY += 0.01;
  }

  const padX = (maxX - minX) * 0.14;
  const padY = (maxY - minY) * 0.14;
  minX -= padX;
  maxX += padX;
  minY -= padY;
  maxY += padY;

  const plotWidth = WIDTH - PADDING * 2;
  const plotHeight = HEIGHT - PADDING * 2;
  const toX = (value: number) => PADDING + ((value - minX) / (maxX - minX)) * plotWidth;
  const toY = (value: number) => PADDING + ((maxY - value) / (maxY - minY)) * plotHeight;

  for (const point of projected) {
    points.push({
      x: toX(point.x),
      y: toY(point.y),
      label: point.label,
      kind: point.kind,
    });
  }

  const gridLines = Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4;
    return {
      x: PADDING + ratio * plotWidth,
      y: PADDING + ratio * plotHeight,
    };
  });

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label="Plot of store positions by latitude and longitude"
      className="h-full w-full rounded-xl border border-slate-200 bg-white shadow-sm"
    >
      <rect x={PADDING} y={PADDING} width={plotWidth} height={plotHeight} fill="#f8fafc" />
      {gridLines.map((line, index) => (
        <g key={`grid-${index}`}>
          <line
            x1={line.x}
            y1={PADDING}
            x2={line.x}
            y2={PADDING + plotHeight}
            stroke="#e2e8f0"
            strokeWidth={1}
          />
          <line
            x1={PADDING}
            y1={line.y}
            x2={PADDING + plotWidth}
            y2={line.y}
            stroke="#e2e8f0"
            strokeWidth={1}
          />
        </g>
      ))}
      <rect
        x={PADDING}
        y={PADDING}
        width={plotWidth}
        height={plotHeight}
        fill="none"
        stroke="#cbd5e1"
        strokeWidth={1}
      />
      <text x={PADDING} y={PADDING - 14} fill="#64748b" fontSize={12}>
        north
      </text>
      <text
        x={PADDING + plotWidth}
        y={HEIGHT - 12}
        fill="#64748b"
        fontSize={12}
        textAnchor="end"
      >
        longitude →
      </text>
      {points.map((point, index) => (
        <g key={`${point.label}-${index}`}>
          {point.kind === "visitor" ? (
            <>
              <circle cx={point.x} cy={point.y} r={9} fill="#2563eb" fillOpacity={0.2} />
              <circle cx={point.x} cy={point.y} r={5} fill="#2563eb" />
            </>
          ) : (
            <>
              <circle cx={point.x} cy={point.y} r={6} fill="#0f172a" fillOpacity={0.15} />
              <circle cx={point.x} cy={point.y} r={3.5} fill="#0f172a" />
            </>
          )}
          <text
            x={point.x + 8}
            y={point.y - 8}
            fontSize={12}
            fill={point.kind === "visitor" ? "#1d4ed8" : "#0f172a"}
            stroke="#ffffff"
            strokeWidth={3}
            paintOrder="stroke"
          >
            {point.label}
          </text>
          <title>
            {point.label} ({point.kind === "visitor" ? "visitor" : "store"})
          </title>
        </g>
      ))}
    </svg>
  );
}

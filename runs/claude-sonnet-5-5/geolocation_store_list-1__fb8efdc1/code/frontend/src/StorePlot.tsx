import type { Store } from "./api";

interface Props {
  stores: Store[];
  me: { lat: number; lng: number } | null;
}

const W = 600;
const H = 360;
const PAD = 36;

export default function StorePlot({ stores, me }: Props) {
  const points = [
    ...stores.map((s) => ({ lat: s.latitude, lng: s.longitude })),
    ...(me ? [{ lat: me.lat, lng: me.lng }] : []),
  ];
  if (points.length === 0) {
    return <p className="text-sm text-slate-500">Nothing to plot.</p>;
  }
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const spanLat = Math.max(maxLat - minLat, 1e-6);
  const spanLng = Math.max(maxLng - minLng, 1e-6);
  const x = (lng: number) =>
    points.length === 1 || maxLng === minLng ? W / 2 : PAD + ((lng - minLng) / spanLng) * (W - 2 * PAD);
  const y = (lat: number) =>
    points.length === 1 || maxLat === minLat ? H / 2 : H - PAD - ((lat - minLat) / spanLat) * (H - 2 * PAD);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Plot of store locations by latitude and longitude"
      className="w-full rounded border border-slate-300 bg-slate-50"
    >
      <rect x={PAD / 2} y={PAD / 2} width={W - PAD} height={H - PAD} className="fill-none stroke-slate-200" />
      <text x={W - 8} y={H - 8} textAnchor="end" className="fill-slate-400 text-[10px]">
        longitude →
      </text>
      <text x={8} y={14} className="fill-slate-400 text-[10px]">
        ↑ latitude
      </text>
      {stores.map((s) => (
        <g key={s.id}>
          <circle cx={x(s.longitude)} cy={y(s.latitude)} r={6} className="fill-indigo-600 stroke-white">
            <title>{`${s.name} (${s.latitude}, ${s.longitude})`}</title>
          </circle>
          <text x={x(s.longitude) + 9} y={y(s.latitude) + 4} className="fill-slate-700 text-[10px]">
            {s.name}
          </text>
        </g>
      ))}
      {me && (
        <g>
          <rect x={x(me.lng) - 6} y={y(me.lat) - 6} width={12} height={12} className="fill-rose-600 stroke-white">
            <title>You are here</title>
          </rect>
          <text x={x(me.lng) + 9} y={y(me.lat) + 4} className="fill-rose-700 text-[10px] font-semibold">
            You
          </text>
        </g>
      )}
    </svg>
  );
}

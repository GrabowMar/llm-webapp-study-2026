import { ArrowDownToLine, ArrowLeft, Clock3, MapPin, Plus, Trash2, UserRound } from "lucide-react";
import { useId, useState } from "react";
import { numberFormat, timeAgo } from "./types";
import type { Reading, Sensor } from "./types";
import { primaryClass } from "./Modal";
import { sensorStyle } from "./sensorStyle";

function ReadingsChart({ readings, unit, color }: { readings: Reading[]; unit: string; color: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const gradient = useId().replace(/:/g, "");
  if (!readings.length) return <div className="flex h-64 flex-col items-center justify-center rounded-lg bg-canvas/80"><span className="mb-3 text-3xl text-muted">—</span><p className="text-sm font-medium">A story waiting to be told.</p><p className="mt-2 text-xs text-muted">The chart will appear when the first reading is recorded.</p></div>;
  const chronological = [...readings].reverse();
  const values = chronological.map((reading) => reading.value);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const padding = (high - low) * 0.2 || Math.max(Math.abs(high) * 0.05, 1);
  const min = low - padding;
  const max = high + padding;
  const start = new Date(chronological[0].recorded_at).getTime();
  const end = new Date(chronological[chronological.length - 1].recorded_at).getTime();
  const points = chronological.map((reading, index) => ({
    x: chronological.length === 1 ? 420 : 60 + ((end === start ? index / (chronological.length - 1) : (new Date(reading.recorded_at).getTime() - start) / (end - start)) * 730),
    y: 205 - ((reading.value - min) / (max - min)) * 175,
  }));
  const active = hover !== null && hover < chronological.length ? hover : chronological.length - 1;
  const selected = chronological[active];
  const selectedPoint = points[active];
  const path = points.map((point) => `${point.x},${point.y}`).join(" L");
  return <div>
    <div className="mb-2 flex h-8 items-center gap-2 text-xs"><span className="size-2 rounded-full" style={{ background: color }} /><span className="font-medium">{numberFormat(selected.value)} {unit}</span><span className="text-muted">at {new Date(selected.recorded_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span></div>
    <svg viewBox="0 0 820 250" className="w-full" role="img" aria-label={`Line chart of ${readings.length} readings, ranging from ${numberFormat(low)} to ${numberFormat(high)} ${unit}`} onMouseLeave={() => setHover(null)}>
      <defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.15" /><stop offset="100%" stopColor={color} stopOpacity="0.01" /></linearGradient></defs>
      {[0, 1, 2, 3, 4].map((index) => <g key={index}><line x1="60" x2="790" y1={30 + index * 43.75} y2={30 + index * 43.75} stroke="#e7ebe3" strokeDasharray="4 5" /><text x="45" y={34 + index * 43.75} textAnchor="end" fill="#96a08f" fontSize="10">{numberFormat(max - (index / 4) * (max - min))}</text></g>)}
      <path d={`M${path} L${points[points.length - 1].x},205 L${points[0].x},205 Z`} fill={`url(#${gradient})`} />
      <path d={`M${path}`} fill="none" stroke={color} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
      <line x1={selectedPoint.x} x2={selectedPoint.x} y1="30" y2="205" stroke={color} strokeOpacity="0.3" strokeDasharray="3 4" />
      {points.map((point, index) => <circle key={chronological[index].id} cx={point.x} cy={point.y} r={index === active ? 4.5 : 3} fill={index === active ? color : "white"} stroke={color} strokeWidth="1.5" tabIndex={0} role="button" aria-label={`${numberFormat(chronological[index].value)} ${unit}, ${new Date(chronological[index].recorded_at).toLocaleString()}`} onMouseEnter={() => setHover(index)} onFocus={() => setHover(index)} onBlur={() => setHover(null)} />)}
      {[0, 1, 2, 3, 4].map((index) => <text key={index} x={60 + index * 182.5} y="237" textAnchor={index === 0 ? "start" : index === 4 ? "end" : "middle"} fill="#96a08f" fontSize="10">{new Date(start + ((end - start) * index) / 4).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</text>)}
    </svg>
  </div>;
}

export default function SensorDetail({ sensor, readings, total, own, demo, limit, setLimit, onBack, onReading, onDelete }: {
  sensor: Sensor; readings: Reading[]; total: number; own: boolean; demo: boolean; limit: number; setLimit: (limit: number) => void; onBack: () => void; onReading: () => void; onDelete: () => void;
}) {
  const style = sensorStyle(sensor);
  const average = readings.length ? readings.reduce((sum, reading) => sum + reading.value / readings.length, 0) : null;
  const download = () => {
    const csv = "id,sensor_id,value,recorded_at\n" + readings.map((reading) => [reading.id, reading.sensor_id, reading.value, reading.recorded_at].join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `sensor-${sensor.id}-readings.csv`; anchor.click(); URL.revokeObjectURL(url);
  };
  return <div>
    <button onClick={onBack} className="mb-7 flex items-center gap-2 rounded text-xs text-muted hover:text-forest"><ArrowLeft size={14} />Back to all sensors</button>
    <div className="flex flex-wrap items-start justify-between gap-5">
      <div className="flex items-center gap-4"><div className={`flex size-14 items-center justify-center rounded-2xl ${style.background} ${style.text}`}><style.Icon size={27} strokeWidth={1.6} /></div><div><div className="flex items-center gap-3"><h1 className="text-[28px] font-semibold tracking-[-1px]">{sensor.name}</h1>{demo && <span className="rounded bg-lime/50 px-2 py-1 text-[10px] text-forest">Demo</span>}</div><div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted"><span className="flex items-center gap-1"><MapPin size={12} />{sensor.location || "No location set"}</span><span className="flex items-center gap-1"><UserRound size={12} />{sensor.owner}</span></div></div></div>
      {own && <div className="flex gap-2"><button onClick={onDelete} aria-label="Delete sensor" className="rounded-lg border border-line bg-white p-2.5 text-muted hover:border-red-200 hover:text-red-600"><Trash2 size={16} /></button><button onClick={onReading} className={primaryClass}><Plus size={15} />Add reading</button></div>}
    </div>
    <div className="my-7 grid grid-cols-1 gap-4 sm:grid-cols-3">
      {[{ label: "Latest value", value: sensor.last_value === null ? "—" : numberFormat(sensor.last_value), note: sensor.unit }, { label: "Average in view", value: average === null ? "—" : numberFormat(average), note: sensor.unit }, { label: "Total readings", value: numberFormat(total), note: "recorded" }].map((item) => <div key={item.label} className="rounded-xl border border-line bg-white px-5 py-5"><p className="text-xs text-muted">{item.label}</p><p className="mt-3 text-[30px] font-medium tracking-[-1px]">{item.value} <span className="text-sm font-normal tracking-normal text-muted">{item.note}</span></p></div>)}
    </div>
    <section className="rounded-xl border border-line bg-white p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">Recent readings</h2><p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted"><Clock3 size={11} />Updated {timeAgo(sensor.last_updated).toLowerCase()}</p></div><select aria-label="Number of recent readings" value={limit} onChange={(event) => setLimit(Number(event.target.value))} className="rounded-lg border border-line bg-canvas px-3 py-2 text-xs">{[24, 50, 100, 250].map((count) => <option key={count} value={count}>Last {count} readings</option>)}</select></div>
      <ReadingsChart readings={readings} unit={sensor.unit} color={style.color} />
    </section>
    <section className="mt-6 overflow-hidden rounded-xl border border-line bg-white">
      <div className="flex items-center justify-between border-b border-line px-6 py-5"><div className="flex items-center gap-2"><h2 className="text-sm font-semibold">Reading history</h2><span className="rounded-md bg-canvas px-2 py-0.5 text-[10px] text-muted">{readings.length} of {total}</span></div><button onClick={download} disabled={!readings.length} className="flex items-center gap-1.5 rounded text-[11px] text-muted hover:text-forest disabled:opacity-40"><ArrowDownToLine size={13} />Export CSV</button></div>
      <div className="max-h-[350px] overflow-auto"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-canvas text-[10px] font-medium uppercase tracking-wider text-muted"><tr><th className="px-6 py-3">Recorded at</th><th className="px-6 py-3">Value</th><th className="px-6 py-3 text-right">Reading ID</th></tr></thead><tbody>{readings.map((reading) => <tr key={reading.id} className="border-t border-line/70 hover:bg-canvas/50"><td className="whitespace-nowrap px-6 py-3.5" title={reading.recorded_at}>{new Date(reading.recorded_at).toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })}</td><td className="whitespace-nowrap px-6 py-3.5 font-medium">{numberFormat(reading.value)} <span className="font-normal text-muted">{sensor.unit}</span></td><td className="px-6 py-3.5 text-right font-mono text-[10px] text-muted">#{reading.id.toString().padStart(4, "0")}</td></tr>)}</tbody></table>{!readings.length && <p className="py-10 text-center text-xs text-muted">No readings yet. {own ? "Add a reading to get started." : "Check back soon."}</p>}</div>
    </section>
  </div>;
}

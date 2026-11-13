import { ArrowUpRight, Clock3, MapPin } from "lucide-react";
import { useId } from "react";
import type { Reading, Sensor } from "./types";
import { isRecent, numberFormat, timeAgo } from "./types";
import { sensorStyle } from "./sensorStyle";

export function Sparkline({ readings, color }: { readings: Reading[]; color: string }) {
  const id = useId().replace(/:/g, "");
  const values = [...readings].reverse().map((reading) => reading.value);
  if (values.length < 2) return <div className="flex h-[57px] items-center gap-3 text-[11px] text-muted"><span className="h-px flex-1 bg-line" />{values.length ? "First reading recorded" : "Waiting for first reading"}<span className="h-px flex-1 bg-line" /></div>;
  const minimum = Math.min(...values);
  const range = Math.max(...values) - minimum || 1;
  const points = values.map((value, index) => `${(index / (values.length - 1)) * 300},${44 - ((value - minimum) / range) * 32}`);
  const last = points[points.length - 1].split(",");
  return <svg viewBox="0 0 300 57" className="h-[57px] w-full overflow-visible" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.15" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
    <path d={`M${points.join(" L")} L300,57 L0,57 Z`} fill={`url(#${id})`} />
    <polyline points={points.join(" ")} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    <circle cx={last[0]} cy={last[1]} r="3" fill={color} stroke="white" strokeWidth="1.5" />
  </svg>;
}

export default function SensorCard({ sensor, readings, onOpen, demo }: { sensor: Sensor; readings: Reading[]; onOpen: () => void; demo: boolean }) {
  const style = sensorStyle(sensor);
  const recent = isRecent(sensor);
  return <article className="group overflow-hidden rounded-xl border border-line bg-white transition-all duration-200 hover:-translate-y-0.5 hover:border-[#cbd7c3] hover:shadow-[0_8px_24px_-12px_#315c4330]">
    <button onClick={onOpen} className="block w-full text-left" aria-label={`View ${sensor.name} sensor and readings`}>
      <div className="px-5 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${style.background} ${style.text}`}><style.Icon size={20} strokeWidth={1.7} /></div>
          <span className={`mt-1 flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-medium ${sensor.last_value === null ? "bg-[#f2f3ef] text-muted" : recent ? "bg-[#f0f5e9] text-[#678448]" : "bg-[#faf3e5] text-[#a28851]"}`}><span className={`size-1.5 rounded-full ${sensor.last_value === null ? "bg-muted" : recent ? "bg-[#89a966]" : "bg-[#c7ac71]"}`} />{sensor.last_value === null ? "Awaiting data" : demo ? "Demo" : recent ? "Reporting" : "Inactive"}</span>
        </div>
        <h3 className="mt-4 truncate text-[15px] font-semibold tracking-[-0.2px]">{sensor.name}</h3>
        <p className="mt-1 flex items-center gap-1 text-[11px] text-muted"><MapPin size={11} />{sensor.location || "No location set"}</p>
        <div className="mb-1 mt-5 flex items-baseline gap-2"><span className="text-[37px] font-medium leading-none tracking-[-1.5px]">{sensor.last_value === null ? "—" : numberFormat(sensor.last_value)}</span><span className="text-[17px] font-normal text-[#95a08e]">{sensor.unit}</span></div>
        <div className="mb-3 text-[10px] text-muted">Latest reading</div>
        <Sparkline readings={readings} color={style.color} />
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-line/80 px-5 py-3.5">
        <span className="flex items-center gap-1.5 text-[10px] text-muted"><Clock3 size={11} />{timeAgo(sensor.last_updated)}</span>
        <span className="flex items-center gap-1 text-[10px] font-medium text-[#718266] transition-colors group-hover:text-forest">View history<ArrowUpRight size={13} /></span>
      </div>
    </button>
  </article>;
}

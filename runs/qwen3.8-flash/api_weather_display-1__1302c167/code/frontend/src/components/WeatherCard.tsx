import type { Report } from "../api";

export type Unit = "C" | "F";

export function formatTemp(celsius: number, unit: Unit): string {
  const value = unit === "C" ? celsius : (celsius * 9) / 5 + 32;
  return `${value.toFixed(1)}°${unit}`;
}

export function formatObserved(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

interface Props {
  report: Report;
  unit: Unit;
}

export default function WeatherCard({ report, unit }: Props) {
  const rows: Array<[string, string]> = [
    ["Country", report.country ?? "—"],
    ["Condition", report.condition],
    ["Humidity", report.humidity === null ? "—" : `${report.humidity}%`],
    ["Wind", report.wind_kph === null ? "—" : `${report.wind_kph.toFixed(1)} kph`],
    ["Observed at", formatObserved(report.observed_at)],
  ];
  return (
    <div className="rounded-xl border border-sky-200 bg-gradient-to-br from-sky-50 to-white p-5 shadow-sm">
      <div className="flex items-baseline justify-between">
        <h2 className="text-2xl font-bold text-slate-900">{report.city}</h2>
        <span className="text-3xl font-semibold text-sky-700">{formatTemp(report.temperature_c, unit)}</span>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-slate-500">{label}</dt>
            <dd className="font-medium text-slate-900">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

import { formatNumber, formatTemp, formatTime } from "../format";
import type { Unit, WeatherReport } from "../types";

interface WeatherCardProps {
  report: WeatherReport;
  unit: Unit;
}

export default function WeatherCard({ report, unit }: WeatherCardProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-2xl font-semibold text-slate-900">{report.city}</h3>
          {report.country ? (
            <p className="text-slate-500">{report.country}</p>
          ) : null}
        </div>
        <div className="text-right">
          <p className="text-4xl font-bold text-sky-700">
            {formatTemp(report.temperature_c, unit)}
          </p>
          {report.condition ? (
            <p className="text-slate-600">{report.condition}</p>
          ) : null}
        </div>
      </div>
      <dl className="mt-5 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
        <div className="rounded-lg bg-slate-50 p-3">
          <dt className="text-slate-500">Humidity</dt>
          <dd className="text-lg font-medium text-slate-900">
            {formatNumber(report.humidity, "%")}
          </dd>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <dt className="text-slate-500">Wind</dt>
          <dd className="text-lg font-medium text-slate-900">
            {formatNumber(report.wind_kph, " km/h")}
          </dd>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <dt className="text-slate-500">Observed</dt>
          <dd className="text-lg font-medium text-slate-900">
            {formatTime(report.observed_at)}
          </dd>
        </div>
      </dl>
    </div>
  );
}

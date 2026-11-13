import { formatTemperature, formatTimestamp } from "../format";
import type { Unit, WeatherReport } from "../types";

interface WeatherCardProps {
  report: WeatherReport;
  unit: Unit;
}

export default function WeatherCard({ report, unit }: WeatherCardProps) {
  const temperature = formatTemperature(report.temperature_c, unit);

  return (
    <section
      data-testid="weather-card"
      className="rounded-2xl border border-slate-200 bg-gradient-to-br from-sky-500 to-blue-600 p-6 text-white shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold" data-testid="weather-city">
            {report.city}
          </h2>
          <p className="text-sm text-sky-100">{report.country ?? "Unknown country"}</p>
        </div>
        <div className="text-right">
          <p className="text-4xl font-bold" data-testid="weather-temperature">
            {temperature}
          </p>
          <p className="text-sm text-sky-100">{report.condition ?? "Unknown conditions"}</p>
        </div>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
        <div className="rounded-lg bg-white/10 px-3 py-2">
          <dt className="text-sky-100">Humidity</dt>
          <dd className="font-semibold" data-testid="weather-humidity">
            {report.humidity === null ? "—" : `${report.humidity}%`}
          </dd>
        </div>
        <div className="rounded-lg bg-white/10 px-3 py-2">
          <dt className="text-sky-100">Wind</dt>
          <dd className="font-semibold" data-testid="weather-wind">
            {report.wind_kph === null ? "—" : `${report.wind_kph} km/h`}
          </dd>
        </div>
        <div className="rounded-lg bg-white/10 px-3 py-2">
          <dt className="text-sky-100">Conditions</dt>
          <dd className="font-semibold">{report.condition ?? "—"}</dd>
        </div>
        <div className="rounded-lg bg-white/10 px-3 py-2">
          <dt className="text-sky-100">Observed</dt>
          <dd className="font-semibold" data-testid="weather-observed">
            {formatTimestamp(report.observed_at)}
          </dd>
        </div>
      </dl>
    </section>
  );
}

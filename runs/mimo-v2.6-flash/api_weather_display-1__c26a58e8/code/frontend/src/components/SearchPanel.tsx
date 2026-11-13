import type { FormEvent } from "react";
import type { WeatherReport } from "../api";
import { formatObserved, formatTemp, type Unit } from "../format";

interface Props {
  unit: Unit;
  onUnitChange: (unit: Unit) => void;
  query: string;
  onQueryChange: (query: string) => void;
  onSearch: (city: string) => void;
  searchedCity: string | null;
  report: WeatherReport | null;
  error: string | null;
}

export default function SearchPanel({
  unit,
  onUnitChange,
  query,
  onQueryChange,
  onSearch,
  searchedCity,
  report,
  error,
}: Props) {
  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSearch(query);
  }

  return (
    <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">City search</h2>
        <div
          className="flex overflow-hidden rounded-lg ring-1 ring-slate-300"
          role="group"
          aria-label="Temperature unit"
        >
          <button
            type="button"
            onClick={() => onUnitChange("C")}
            aria-pressed={unit === "C"}
            className={
              unit === "C"
                ? "bg-sky-600 px-3 py-1.5 text-sm font-medium text-white"
                : "bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
            }
          >
            °C
          </button>
          <button
            type="button"
            onClick={() => onUnitChange("F")}
            aria-pressed={unit === "F"}
            className={
              unit === "F"
                ? "bg-sky-600 px-3 py-1.5 text-sm font-medium text-white"
                : "bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
            }
          >
            °F
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <label htmlFor="city-search" className="sr-only">
          City name
        </label>
        <input
          id="city-search"
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Enter a city name"
          required
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
        />
        <button
          type="submit"
          className="rounded-md bg-sky-600 px-5 py-2 text-sm font-medium text-white hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
        >
          Search
        </button>
      </form>

      {error && (
        <div
          role="alert"
          className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {report && <WeatherCard report={report} unit={unit} />}

      {!report && !error && searchedCity && (
        <p className="mt-4 rounded-lg bg-slate-50 px-4 py-8 text-center text-slate-500 ring-1 ring-slate-200">
          No weather data for {searchedCity}
        </p>
      )}

      {!report && !error && !searchedCity && (
        <p className="mt-4 text-sm text-slate-500">
          Search for a city to see the current conditions.
        </p>
      )}
    </div>
  );
}

function WeatherCard({ report, unit }: { report: WeatherReport; unit: Unit }) {
  return (
    <div className="mt-4 rounded-xl bg-gradient-to-br from-sky-50 to-blue-100 p-6 ring-1 ring-sky-200">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-2xl font-bold text-slate-900">{report.city}</h3>
          <p className="text-sm text-slate-600">{report.country ?? "—"}</p>
        </div>
        <p className="text-4xl font-semibold text-slate-800">
          {formatTemp(report.temperature_c, unit)}
        </p>
      </div>
      <p className="mt-3 inline-block rounded-full bg-white/80 px-3 py-1 text-sm font-medium text-sky-800 ring-1 ring-sky-200">
        {report.condition ?? "Unknown"}
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-slate-500">Humidity</dt>
          <dd className="font-semibold text-slate-800">
            {report.humidity === null ? "—" : `${report.humidity}%`}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Wind</dt>
          <dd className="font-semibold text-slate-800">
            {report.wind_kph === null ? "—" : `${report.wind_kph} km/h`}
          </dd>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <dt className="text-slate-500">Observed</dt>
          <dd className="font-semibold text-slate-800">{formatObserved(report.observed_at)}</dd>
        </div>
      </dl>
    </div>
  );
}

import { useId, useState, type FormEvent } from "react";
import type { ReportPayload, WeatherReport } from "../api";

interface Props {
  initial?: WeatherReport | null;
  submitLabel: string;
  onSubmit: (payload: ReportPayload) => Promise<void>;
  onCancel?: () => void;
}

function toNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isNaN(parsed) ? null : parsed;
}

interface FormState {
  city: string;
  country: string;
  temperature_c: string;
  condition: string;
  humidity: string;
  wind_kph: string;
}

function initialState(report: WeatherReport | null | undefined): FormState {
  if (!report) {
    return { city: "", country: "", temperature_c: "", condition: "", humidity: "", wind_kph: "" };
  }
  return {
    city: report.city,
    country: report.country ?? "",
    temperature_c: String(report.temperature_c),
    condition: report.condition ?? "",
    humidity: report.humidity === null ? "" : String(report.humidity),
    wind_kph: report.wind_kph === null ? "" : String(report.wind_kph),
  };
}

export default function ReportForm({ initial, submitLabel, onSubmit, onCancel }: Props) {
  const id = useId();
  const [form, setForm] = useState<FormState>(() => initialState(initial));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function update<K extends keyof FormState>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await onSubmit({
        city: form.city,
        temperature_c: toNumber(form.temperature_c),
        country: form.country.trim() === "" ? null : form.country.trim(),
        condition: form.condition.trim() === "" ? null : form.condition.trim(),
        humidity: toNumber(form.humidity),
        wind_kph: toNumber(form.wind_kph),
      });
      if (!initial) setForm(initialState(null));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const field =
    "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label htmlFor={`${id}-city`} className="mb-1 block text-sm font-medium text-slate-700">
            City *
          </label>
          <input
            id={`${id}-city`}
            type="text"
            value={form.city}
            onChange={(e) => update("city", e.target.value)}
            required
            className={field}
          />
        </div>
        <div>
          <label htmlFor={`${id}-country`} className="mb-1 block text-sm font-medium text-slate-700">
            Country
          </label>
          <input
            id={`${id}-country`}
            type="text"
            value={form.country}
            onChange={(e) => update("country", e.target.value)}
            className={field}
          />
        </div>
        <div>
          <label
            htmlFor={`${id}-temperature`}
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Temperature (°C) *
          </label>
          <input
            id={`${id}-temperature`}
            type="number"
            step="any"
            value={form.temperature_c}
            onChange={(e) => update("temperature_c", e.target.value)}
            required
            className={field}
          />
        </div>
        <div>
          <label htmlFor={`${id}-condition`} className="mb-1 block text-sm font-medium text-slate-700">
            Condition
          </label>
          <input
            id={`${id}-condition`}
            type="text"
            value={form.condition}
            onChange={(e) => update("condition", e.target.value)}
            className={field}
          />
        </div>
        <div>
          <label htmlFor={`${id}-humidity`} className="mb-1 block text-sm font-medium text-slate-700">
            Humidity (%)
          </label>
          <input
            id={`${id}-humidity`}
            type="number"
            min="0"
            max="100"
            value={form.humidity}
            onChange={(e) => update("humidity", e.target.value)}
            className={field}
          />
        </div>
        <div>
          <label htmlFor={`${id}-wind`} className="mb-1 block text-sm font-medium text-slate-700">
            Wind (km/h)
          </label>
          <input
            id={`${id}-wind`}
            type="number"
            step="any"
            min="0"
            value={form.wind_kph}
            onChange={(e) => update("wind_kph", e.target.value)}
            className={field}
          />
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Saving…" : submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

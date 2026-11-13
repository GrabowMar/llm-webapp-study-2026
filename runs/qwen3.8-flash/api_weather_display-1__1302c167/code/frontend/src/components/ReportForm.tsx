import { useState } from "react";
import type { FormEvent } from "react";
import type { Report, ReportInput } from "../api";
import { ApiError, createReport, updateReport } from "../api";

const EMPTY: ReportInput = {
  city: "",
  country: "",
  temperature_c: "",
  condition: "",
  humidity: "",
  wind_kph: "",
};

export function fromReport(r: Report): ReportInput {
  return {
    city: r.city,
    country: r.country ?? "",
    temperature_c: String(r.temperature_c),
    condition: r.condition,
    humidity: r.humidity === null ? "" : String(r.humidity),
    wind_kph: r.wind_kph === null ? "" : String(r.wind_kph),
  };
}

interface Props {
  initial: ReportInput;
  reportId: number | null;
  onSaved: () => void;
  onCancel: () => void;
}

export default function ReportForm({ initial, reportId, onSaved, onCancel }: Props) {
  const [input, setInput] = useState<ReportInput>(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function set(field: keyof ReportInput, value: string) {
    setInput((prev) => ({ ...prev, [field]: value }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (reportId === null) {
        await createReport(input);
      } else {
        await updateReport(reportId, input);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const label = "block text-xs font-medium text-slate-500";
  const field =
    "mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-sky-500 focus:outline-none";

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <h3 className="text-sm font-semibold text-slate-700">
        {reportId === null ? "Add report" : `Edit report #${reportId}`}
      </h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <span className={label}>City *</span>
          <input className={field} value={input.city} onChange={(e) => set("city", e.target.value)} />
        </div>
        <div>
          <span className={label}>Country</span>
          <input className={field} value={input.country} onChange={(e) => set("country", e.target.value)} />
        </div>
        <div>
          <span className={label}>Temperature °C *</span>
          <input
            className={field}
            type="number"
            step="any"
            value={input.temperature_c}
            onChange={(e) => set("temperature_c", e.target.value)}
          />
        </div>
        <div>
          <span className={label}>Condition *</span>
          <input className={field} value={input.condition} onChange={(e) => set("condition", e.target.value)} />
        </div>
        <div>
          <span className={label}>Humidity % (0–100)</span>
          <input
            className={field}
            type="number"
            value={input.humidity}
            onChange={(e) => set("humidity", e.target.value)}
          />
        </div>
        <div>
          <span className={label}>Wind kph</span>
          <input
            className={field}
            type="number"
            step="any"
            value={input.wind_kph}
            onChange={(e) => set("wind_kph", e.target.value)}
          />
        </div>
      </div>
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-sky-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
        >
          {busy ? "Saving…" : reportId === null ? "Add" : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-slate-300 px-4 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export { EMPTY };

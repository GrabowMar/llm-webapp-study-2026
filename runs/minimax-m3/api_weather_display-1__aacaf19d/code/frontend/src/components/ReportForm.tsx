import { useState } from "react";
import type { FormEvent } from "react";
import { ApiError } from "../api";
import type { ReportInput } from "../types";

export const EMPTY_REPORT: ReportInput = {
  city: "",
  country: "",
  temperature_c: "",
  condition: "",
  humidity: "",
  wind_kph: "",
};

interface FieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  type?: string;
  step?: string;
  placeholder?: string;
}

function Field({ id, label, value, onChange, error, type = "text", step, placeholder }: FieldProps) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        step={step}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
        className={`mt-1 w-full rounded-lg border px-3 py-2 text-slate-900 outline-none focus:ring-2 ${
          error
            ? "border-rose-400 focus:border-rose-500 focus:ring-rose-100"
            : "border-slate-300 focus:border-sky-500 focus:ring-sky-100"
        }`}
      />
      {error && <p className="mt-1 text-sm text-rose-600">{error}</p>}
    </div>
  );
}

interface ReportFormProps {
  title: string;
  submitLabel: string;
  initial?: ReportInput;
  onSubmit: (input: ReportInput) => Promise<void>;
  onCancel?: () => void;
}

export default function ReportForm({
  title,
  submitLabel,
  initial,
  onSubmit,
  onCancel,
}: ReportFormProps) {
  const [values, setValues] = useState<ReportInput>(initial ?? EMPTY_REPORT);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function update(field: keyof ReportInput) {
    return (value: string) => setValues((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    setMessage(null);
    try {
      await onSubmit(values);
      if (!initial) {
        setValues(EMPTY_REPORT);
      }
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.errors);
        setMessage(error.message);
      } else {
        setMessage("Could not reach the server. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit} noValidate>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h3>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="city"
          label="City"
          value={values.city}
          onChange={update("city")}
          error={errors.city}
          placeholder="Berlin"
        />
        <Field
          id="country"
          label="Country"
          value={values.country}
          onChange={update("country")}
          error={errors.country}
          placeholder="Germany"
        />
        <Field
          id="temperature_c"
          label="Temperature (°C)"
          type="number"
          step="0.1"
          value={values.temperature_c}
          onChange={update("temperature_c")}
          error={errors.temperature_c}
          placeholder="18.5"
        />
        <Field
          id="condition"
          label="Condition"
          value={values.condition}
          onChange={update("condition")}
          error={errors.condition}
          placeholder="Cloudy"
        />
        <Field
          id="humidity"
          label="Humidity (%)"
          type="number"
          step="1"
          value={values.humidity}
          onChange={update("humidity")}
          error={errors.humidity}
          placeholder="70"
        />
        <Field
          id="wind_kph"
          label="Wind (km/h)"
          type="number"
          step="0.1"
          value={values.wind_kph}
          onChange={update("wind_kph")}
          error={errors.wind_kph}
          placeholder="12"
        />
      </div>

      {message && (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {message}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Saving…" : submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

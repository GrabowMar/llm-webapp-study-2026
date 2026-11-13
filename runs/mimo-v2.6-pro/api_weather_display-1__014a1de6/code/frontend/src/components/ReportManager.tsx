import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { createReport, deleteReport, fetchReports, updateReport } from "../api";
import { formatNumber, formatTemp, formatTime } from "../format";
import type { ReportInput, Unit, WeatherReport } from "../types";

const PAGE_SIZE = 10;

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200";

interface FormFields {
  city: string;
  country: string;
  temperature: string;
  condition: string;
  humidity: string;
  wind: string;
}

const emptyForm: FormFields = {
  city: "",
  country: "",
  temperature: "",
  condition: "",
  humidity: "",
  wind: "",
};

function fieldsFrom(report: WeatherReport): FormFields {
  return {
    city: report.city,
    country: report.country ?? "",
    temperature: report.temperature_c === null ? "" : String(report.temperature_c),
    condition: report.condition ?? "",
    humidity: report.humidity === null ? "" : String(report.humidity),
    wind: report.wind_kph === null ? "" : String(report.wind_kph),
  };
}

function parseNumber(value: string, label: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a number`);
  return parsed;
}

interface ReportManagerProps {
  unit: Unit;
}

export default function ReportManager({ unit }: ReportManagerProps) {
  const [items, setItems] = useState<WeatherReport[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<WeatherReport | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [fields, setFields] = useState<FormFields>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<number | null>(null);

  const load = useCallback(async (targetPage: number) => {
    const data = await fetchReports(targetPage, PAGE_SIZE);
    setItems(data.items);
    setTotal(data.total);
  }, []);

  useEffect(() => {
    load(page).catch((err) =>
      setNotice(err instanceof Error ? err.message : "Could not load reports"),
    );
  }, [page, load]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function openCreate() {
    setEditing(null);
    setFields(emptyForm);
    setFormError(null);
    setNotice(null);
    setFormOpen(true);
  }

  function openEdit(report: WeatherReport) {
    setEditing(report);
    setFields(fieldsFrom(report));
    setFormError(null);
    setNotice(null);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditing(null);
    setFormError(null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    let input: ReportInput;
    try {
      input = {
        city: fields.city,
        country: fields.country.trim() === "" ? null : fields.country.trim(),
        temperature_c: parseNumber(fields.temperature, "temperature_c"),
        condition: fields.condition.trim() === "" ? null : fields.condition.trim(),
        humidity: parseNumber(fields.humidity, "humidity"),
        wind_kph: parseNumber(fields.wind, "wind_kph"),
      };
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Invalid form input");
      return;
    }
    try {
      if (editing) {
        await updateReport(editing.id, input);
        setNotice(`Report for ${input.city} updated.`);
      } else {
        await createReport(input);
        setNotice(`Report for ${input.city} added.`);
        setPage(1);
      }
      closeForm();
      await load(editing ? page : 1);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not save the report");
    }
  }

  async function handleDelete(report: WeatherReport) {
    setNotice(null);
    try {
      await deleteReport(report.id);
      setConfirmingId(null);
      setNotice(`Report for ${report.city} deleted.`);
      await load(page);
    } catch (err) {
      setConfirmingId(null);
      setNotice(err instanceof Error ? err.message : "Could not delete the report");
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">Weather reports</h2>
        <button
          type="button"
          onClick={openCreate}
          className="rounded-lg bg-sky-600 px-4 py-2 font-medium text-white hover:bg-sky-700"
        >
          Add report
        </button>
      </div>

      {notice ? (
        <p className="mt-3 rounded-lg bg-slate-100 p-2 text-sm text-slate-700" role="status">
          {notice}
        </p>
      ) : null}

      {formOpen ? (
        <form className="mt-4 space-y-3 rounded-lg bg-slate-50 p-4" onSubmit={handleSubmit}>
          <h3 className="font-medium text-slate-900">
            {editing ? `Edit report for ${editing.city}` : "Add a report"}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-sm text-slate-600" htmlFor="report-city">
                City
              </label>
              <input
                id="report-city"
                className={inputClass}
                value={fields.city}
                onChange={(e) => setFields({ ...fields, city: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm text-slate-600" htmlFor="report-country">
                Country
              </label>
              <input
                id="report-country"
                className={inputClass}
                value={fields.country}
                onChange={(e) => setFields({ ...fields, country: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm text-slate-600" htmlFor="report-temperature">
                Temperature (°C)
              </label>
              <input
                id="report-temperature"
                className={inputClass}
                value={fields.temperature}
                onChange={(e) => setFields({ ...fields, temperature: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm text-slate-600" htmlFor="report-condition">
                Condition
              </label>
              <input
                id="report-condition"
                className={inputClass}
                value={fields.condition}
                onChange={(e) => setFields({ ...fields, condition: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm text-slate-600" htmlFor="report-humidity">
                Humidity (%)
              </label>
              <input
                id="report-humidity"
                className={inputClass}
                value={fields.humidity}
                onChange={(e) => setFields({ ...fields, humidity: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm text-slate-600" htmlFor="report-wind">
                Wind (km/h)
              </label>
              <input
                id="report-wind"
                className={inputClass}
                value={fields.wind}
                onChange={(e) => setFields({ ...fields, wind: e.target.value })}
              />
            </div>
          </div>
          {formError ? (
            <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700" role="alert">
              {formError}
            </p>
          ) : null}
          <div className="flex gap-2">
            <button
              type="submit"
              className="rounded-lg bg-sky-600 px-4 py-2 font-medium text-white hover:bg-sky-700"
            >
              {editing ? "Save changes" : "Add report"}
            </button>
            <button
              type="button"
              onClick={closeForm}
              className="rounded-lg border border-slate-300 px-4 py-2 font-medium text-slate-700 hover:bg-slate-100"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {items.length === 0 ? (
        <p className="mt-4 text-slate-500">No reports yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100">
          {items.map((report) => (
            <li key={report.id} className="py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-slate-900">
                    {report.city}
                    {report.country ? (
                      <span className="ml-2 font-normal text-slate-500">{report.country}</span>
                    ) : null}
                  </p>
                  <p className="text-sm text-slate-600">
                    {formatTemp(report.temperature_c, unit)}
                    {report.condition ? ` · ${report.condition}` : ""}
                    {` · ${formatNumber(report.humidity, "%")} humidity`}
                    {` · ${formatNumber(report.wind_kph, " km/h")} wind`}
                  </p>
                  <p className="text-xs text-slate-400">
                    Observed {formatTime(report.observed_at)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {confirmingId === report.id ? (
                    <>
                      <span className="text-sm text-slate-600">Delete this report?</span>
                      <button
                        type="button"
                        onClick={() => handleDelete(report)}
                        className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
                      >
                        Confirm delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingId(null)}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => openEdit(report)}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingId(report.id)}
                        className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {total > 0 ? (
        <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
          <span>
            Page {page} of {pageCount} · {total} report{total === 1 ? "" : "s"}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= pageCount}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

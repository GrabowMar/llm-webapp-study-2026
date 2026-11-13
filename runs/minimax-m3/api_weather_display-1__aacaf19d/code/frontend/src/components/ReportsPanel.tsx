import { useCallback, useEffect, useState } from "react";
import { ApiError, createReport, deleteReport, listReports, updateReport } from "../api";
import { formatTemperature, formatTimestamp } from "../format";
import type { ReportInput, Unit, WeatherReport } from "../types";
import ReportForm from "./ReportForm";

const PAGE_SIZE = 10;

interface ReportsPanelProps {
  unit: Unit;
}

export default function ReportsPanel({ unit }: ReportsPanelProps) {
  const [items, setItems] = useState<WeatherReport[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<WeatherReport | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const load = useCallback(async (targetPage: number) => {
    setLoading(true);
    try {
      const page_data = await listReports({ page: targetPage, pageSize: PAGE_SIZE });
      setItems(page_data.items);
      setTotal(page_data.total);
      setPage(page_data.page);
      setFailure(null);
    } catch (error) {
      setFailure(error instanceof ApiError ? error.message : "Could not load the reports.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(1);
  }, [load]);

  async function handleCreate(input: ReportInput) {
    await createReport(input);
    setNotice(`Added a report for ${input.city.trim()}.`);
    setFailure(null);
    await load(1);
  }

  async function handleUpdate(id: number, input: ReportInput) {
    await updateReport(id, input);
    setNotice(`Updated the report for ${input.city.trim()}.`);
    setFailure(null);
    setEditing(null);
    await load(page);
  }

  async function handleDelete(report: WeatherReport) {
    const confirmed = window.confirm(
      `Delete the weather report for ${report.city}? This cannot be undone.`,
    );
    if (!confirmed) return;
    try {
      await deleteReport(report.id);
      setNotice(`Deleted the report for ${report.city}.`);
      setFailure(null);
      if (items.length === 1 && page > 1) {
        await load(page - 1);
      } else {
        await load(page);
      }
    } catch (error) {
      setFailure(error instanceof ApiError ? error.message : "Could not delete the report.");
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Manage weather reports</h2>
        <p className="mt-1 text-sm text-slate-500">
          Add a report, edit the details of an existing one, or remove it.
        </p>
        <div className="mt-4">
          <ReportForm title="Add a report" submitLabel="Add report" onSubmit={handleCreate} />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">Reports</h2>
          <span className="text-sm text-slate-500" data-testid="reports-count">
            {total} report{total === 1 ? "" : "s"}
          </span>
        </div>

        {notice && (
          <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>
        )}
        {failure && (
          <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {failure}
          </p>
        )}

        {loading && <p className="mt-4 text-sm text-slate-500">Loading reports…</p>}

        {!loading && items.length === 0 && (
          <p className="mt-4 text-sm text-slate-500">No reports yet. Add one above.</p>
        )}

        <ul className="mt-4 divide-y divide-slate-100" data-testid="report-list">
          {items.map((report) => (
            <li key={report.id} className="py-3">
              {editing?.id === report.id ? (
                <ReportForm
                  title={`Edit ${report.city}`}
                  submitLabel="Save changes"
                  initial={{
                    city: report.city,
                    country: report.country ?? "",
                    temperature_c: report.temperature_c === null ? "" : String(report.temperature_c),
                    condition: report.condition ?? "",
                    humidity: report.humidity === null ? "" : String(report.humidity),
                    wind_kph: report.wind_kph === null ? "" : String(report.wind_kph),
                  }}
                  onSubmit={(input) => handleUpdate(report.id, input)}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">
                      {report.city}
                      {report.country ? (
                        <span className="ml-2 text-sm font-normal text-slate-500">
                          {report.country}
                        </span>
                      ) : null}
                    </p>
                    <p className="text-sm text-slate-600">
                      {formatTemperature(report.temperature_c, unit)}
                      {report.condition ? ` · ${report.condition}` : ""}
                      {report.humidity !== null ? ` · ${report.humidity}% humidity` : ""}
                      {report.wind_kph !== null ? ` · ${report.wind_kph} km/h wind` : ""}
                    </p>
                    <p className="text-xs text-slate-400">
                      Observed {formatTimestamp(report.observed_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setEditing(report)}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(report)}
                      className="rounded-lg border border-rose-300 px-3 py-1.5 text-sm font-medium text-rose-600 transition hover:bg-rose-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>

        {total > PAGE_SIZE && (
          <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => void load(page - 1)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <span>
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => void load(page + 1)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

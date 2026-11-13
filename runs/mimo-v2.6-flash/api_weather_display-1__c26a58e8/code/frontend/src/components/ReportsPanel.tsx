import { useState } from "react";
import { api, type ReportPayload, type WeatherReport } from "../api";
import { formatObserved, formatTemp, type Unit } from "../format";
import ReportForm from "./ReportForm";

interface Props {
  reports: WeatherReport[];
  unit: Unit;
  loadError: string | null;
  onChanged: () => void;
}

export default function ReportsPanel({ reports, unit, loadError, onChanged }: Props) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleAdd(payload: ReportPayload) {
    setActionError(null);
    await api.createReport(payload);
    onChanged();
  }

  async function handleEdit(id: number, payload: ReportPayload) {
    setActionError(null);
    await api.updateReport(id, payload);
    setEditingId(null);
    onChanged();
  }

  async function handleDelete(report: WeatherReport) {
    setActionError(null);
    if (!window.confirm(`Delete the weather report for ${report.city}?`)) return;
    try {
      await api.deleteReport(report.id);
      onChanged();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to delete report");
    }
  }

  return (
    <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900">Weather reports</h2>
        <span className="text-sm text-slate-500">
          {reports.length} {reports.length === 1 ? "report" : "reports"}
        </span>
      </div>

      {loadError && (
        <div
          role="alert"
          className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {loadError}
        </div>
      )}
      {actionError && (
        <div
          role="alert"
          className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {actionError}
        </div>
      )}

      <section className="mt-4 rounded-lg bg-slate-50 p-4 ring-1 ring-slate-200">
        <h3 className="text-sm font-semibold text-slate-700">Add report</h3>
        <div className="mt-3">
          <ReportForm submitLabel="Add report" onSubmit={handleAdd} />
        </div>
      </section>

      {reports.length === 0 && !loadError ? (
        <p className="mt-6 text-sm text-slate-500">No reports yet.</p>
      ) : (
        <ul className="mt-6 divide-y divide-slate-100">
          {reports.map((report) => (
            <li key={report.id} className="py-4">
              {editingId === report.id ? (
                <div>
                  <h3 className="mb-3 text-sm font-semibold text-slate-700">
                    Edit report for {report.city}
                  </h3>
                  <ReportForm
                    initial={report}
                    submitLabel="Save changes"
                    onSubmit={(payload) => handleEdit(report.id, payload)}
                    onCancel={() => setEditingId(null)}
                  />
                </div>
              ) : (
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">
                      {report.city}
                      {report.country && (
                        <span className="ml-2 font-normal text-slate-500">{report.country}</span>
                      )}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {formatTemp(report.temperature_c, unit)} ·{" "}
                      {report.condition ?? "Unknown"} · Humidity{" "}
                      {report.humidity === null ? "—" : `${report.humidity}%`} · Wind{" "}
                      {report.wind_kph === null ? "—" : `${report.wind_kph} km/h`}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Observed {formatObserved(report.observed_at)}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setActionError(null);
                        setEditingId(report.id);
                      }}
                      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(report)}
                      className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

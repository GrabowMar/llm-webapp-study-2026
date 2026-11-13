import { useCallback, useEffect, useState } from "react";
import type { Report } from "../api";
import { ApiError, deleteReport, listReports } from "../api";
import ReportForm, { EMPTY, fromReport } from "./ReportForm";
import { formatTemp } from "./WeatherCard";
import type { Unit } from "./WeatherCard";

interface Props {
  unit: Unit;
  refreshKey: number;
}

const PAGE_SIZE = 10;

export default function ReportsPanel({ unit, refreshKey }: Props) {
  const [data, setData] = useState<Report[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await listReports(page, PAGE_SIZE);
      setData(res.items);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load reports.");
    }
  }, [page]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  async function remove(r: Report) {
    if (!window.confirm(`Delete the weather report for '${r.city}'?`)) return;
    setError(null);
    try {
      await deleteReport(r.id);
      if (data && data.length === 1 && page > 1) {
        setPage(page - 1);
      } else {
        await load();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete report.");
    }
  }

  function onSaved() {
    setShowAdd(false);
    setEditing(null);
    load();
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Weather reports</h2>
        <button
          onClick={() => {
            setShowAdd((v) => !v);
            setEditing(null);
          }}
          className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-700"
        >
          {showAdd ? "Close form" : "Add report"}
        </button>
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {showAdd && <ReportForm initial={EMPTY} reportId={null} onSaved={onSaved} onCancel={() => setShowAdd(false)} />}

      {editing && (
        <ReportForm
          key={editing.id}
          initial={fromReport(editing)}
          reportId={editing.id}
          onSaved={onSaved}
          onCancel={() => setEditing(null)}
        />
      )}

      {data === null ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">City</th>
                  <th className="px-3 py-2">Country</th>
                  <th className="px-3 py-2">Temp ({unit === "C" ? "°C" : "°F"})</th>
                  <th className="px-3 py-2">Condition</th>
                  <th className="px-3 py-2">Humidity</th>
                  <th className="px-3 py-2">Wind</th>
                  <th className="px-3 py-2">Observed</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {data.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                      No reports yet.
                    </td>
                  </tr>
                )}
                {data.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2 font-medium text-slate-900">{r.city}</td>
                    <td className="px-3 py-2">{r.country ?? "—"}</td>
                    <td className="px-3 py-2">{formatTemp(r.temperature_c, unit)}</td>
                    <td className="px-3 py-2">{r.condition}</td>
                    <td className="px-3 py-2">{r.humidity === null ? "—" : `${r.humidity}%`}</td>
                    <td className="px-3 py-2">{r.wind_kph === null ? "—" : `${r.wind_kph.toFixed(1)} kph`}</td>
                    <td className="px-3 py-2 text-slate-500">{r.observed_at}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button
                        onClick={() => {
                          setEditing(r);
                          setShowAdd(false);
                        }}
                        className="mr-2 rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => remove(r)}
                        className="rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-md border border-slate-300 px-3 py-1 hover:bg-slate-100 disabled:opacity-40"
            >
              Prev
            </button>
            <span>
              Page {page} of {pages} ({total} reports)
            </span>
            <button
              disabled={page >= pages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-md border border-slate-300 px-3 py-1 hover:bg-slate-100 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </>
      )}
    </section>
  );
}

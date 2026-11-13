import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createIncident } from "../api";

const SEVERITIES = ["sev1", "sev2", "sev3", "sev4"];

export default function NewIncidentPage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [service, setService] = useState("");
  const [severity, setSeverity] = useState("sev1");
  const [commander, setCommander] = useState("");
  const [impactSummary, setImpactSummary] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrors([]);
    setLoading(true);
    try {
      const incident = await createIncident({
        title,
        service,
        severity,
        commander,
        impact_summary: impactSummary,
      });
      navigate(`/incidents/${incident.id}`);
    } catch (err) {
      const apiErr = err as { messages?: string[]; message?: string };
      setErrors(
        apiErr.messages?.length ? apiErr.messages : [apiErr.message ?? "Failed to open incident"],
      );
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "w-full rounded border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none";

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Open incident</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        {errors.length > 0 && (
          <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <ul className="list-disc pl-5">
              {errors.map((msg) => (
                <li key={msg}>{msg}</li>
              ))}
            </ul>
          </div>
        )}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Title
          </label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Service
          </label>
          <input value={service} onChange={(e) => setService(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Severity
          </label>
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            className={inputClass}
          >
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Commander
          </label>
          <input
            value={commander}
            onChange={(e) => setCommander(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Impact summary
          </label>
          <textarea
            value={impactSummary}
            onChange={(e) => setImpactSummary(e.target.value)}
            rows={4}
            className={inputClass}
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Opening…" : "Open incident"}
        </button>
      </form>
    </div>
  );
}

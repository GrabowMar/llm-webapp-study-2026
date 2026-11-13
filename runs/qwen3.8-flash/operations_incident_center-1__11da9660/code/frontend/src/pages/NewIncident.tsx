import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, api, type Severity } from "../api";
import { FieldErrors, SEVERITIES } from "../components/ui";

export default function NewIncident() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [service, setService] = useState("");
  const [severity, setSeverity] = useState<Severity>("sev3");
  const [commander, setCommander] = useState("");
  const [impact, setImpact] = useState("");
  const [errors, setErrors] = useState<Record<string, string> | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors(null);
    setFormError(null);
    setBusy(true);
    try {
      const inc = await api.createIncident({
        title,
        service,
        severity,
        commander,
        impact_summary: impact,
      });
      navigate(`/incidents/${inc.id}`);
    } catch (err) {
      const e = err as ApiError;
      if (e.status === 401) {
        navigate("/login");
        return;
      }
      setErrors(e.details);
      if (!e.details) setFormError(e.message ?? "failed to open incident");
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Open an incident</h1>
      {formError && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {formError}
        </div>
      )}
      <div className="mb-4">
        <FieldErrors errors={errors} />
      </div>
      <form
        onSubmit={submit}
        className="space-y-5 rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
      >
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Title *</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Service *</label>
          <input
            value={service}
            onChange={(e) => setService(e.target.value)}
            placeholder="e.g. checkout-api"
            className={inputCls}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Severity *</label>
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value as Severity)}
            className={inputCls}
          >
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Commander</label>
          <input
            value={commander}
            onChange={(e) => setCommander(e.target.value)}
            placeholder="who is running the call"
            className={inputCls}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Impact summary</label>
          <textarea
            value={impact}
            onChange={(e) => setImpact(e.target.value)}
            rows={4}
            placeholder="who/what is affected and how badly"
            className={inputCls}
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50"
        >
          {busy ? "Opening…" : "Open incident"}
        </button>
      </form>
    </div>
  );
}

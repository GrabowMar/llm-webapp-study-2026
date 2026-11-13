import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, api } from "../api";
import type { Severity } from "../types";
import { SEVERITIES } from "../types";
import { Card, ErrorBanner, FieldError, inputClass, primaryButtonClass, secondaryButtonClass } from "../ui";

export default function OpenIncidentPage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [service, setService] = useState("");
  const [severity, setSeverity] = useState<Severity>("sev2");
  const [commander, setCommander] = useState("");
  const [impactSummary, setImpactSummary] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const incident = await api.createIncident({
        title,
        service,
        severity,
        commander: commander.trim() || null,
        impact_summary: impactSummary.trim() || null,
      });
      navigate(`/incidents/${incident.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, "Failed to open incident"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold text-slate-900">Open incident</h1>
      <p className="mt-1 text-sm text-slate-500">
        The incident starts in status <span className="font-medium">investigating</span>. The resolution target
        depends on the severity.
      </p>

      <Card className="mt-6">
        <form onSubmit={onSubmit} className="space-y-5">
          <ErrorBanner
            message={error && Object.keys(error.fields).length === 0 ? error.message : null}
          />

          <div>
            <label htmlFor="incident-title" className="block text-sm font-medium text-slate-700">
              Title
            </label>
            <input
              id="incident-title"
              className={`${inputClass} mt-1`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Checkout API returning 500s"
              required
            />
            <FieldError message={error?.fields.title} />
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="incident-service" className="block text-sm font-medium text-slate-700">
                Service
              </label>
              <input
                id="incident-service"
                className={`${inputClass} mt-1`}
                value={service}
                onChange={(e) => setService(e.target.value)}
                placeholder="checkout-api"
                required
              />
              <FieldError message={error?.fields.service} />
            </div>
            <div>
              <label htmlFor="incident-severity" className="block text-sm font-medium text-slate-700">
                Severity
              </label>
              <select
                id="incident-severity"
                className={`${inputClass} mt-1`}
                value={severity}
                onChange={(e) => setSeverity(e.target.value as Severity)}
              >
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <FieldError message={error?.fields.severity} />
            </div>
          </div>

          <div>
            <label htmlFor="incident-commander" className="block text-sm font-medium text-slate-700">
              Commander (optional)
            </label>
            <input
              id="incident-commander"
              className={`${inputClass} mt-1`}
              value={commander}
              onChange={(e) => setCommander(e.target.value)}
              placeholder="Who is leading the response?"
            />
            <FieldError message={error?.fields.commander} />
          </div>

          <div>
            <label htmlFor="incident-impact" className="block text-sm font-medium text-slate-700">
              Impact summary (optional)
            </label>
            <textarea
              id="incident-impact"
              className={`${inputClass} mt-1`}
              rows={4}
              value={impactSummary}
              onChange={(e) => setImpactSummary(e.target.value)}
              placeholder="Who is affected and how?"
            />
            <FieldError message={error?.fields.impact_summary} />
          </div>

          <div className="flex items-center gap-3">
            <button type="submit" className={primaryButtonClass} disabled={busy}>
              {busy ? "Opening..." : "Open incident"}
            </button>
            <button type="button" className={secondaryButtonClass} onClick={() => navigate("/incidents")}>
              Cancel
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}

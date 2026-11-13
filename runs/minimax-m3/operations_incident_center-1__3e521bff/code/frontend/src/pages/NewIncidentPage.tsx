import { useState } from "react";
import { api, ApiError } from "../api";
import { navigate } from "../router";
import {
  Card,
  ErrorBanner,
  Field,
  SectionTitle,
  buttonGhost,
  buttonPrimary,
  inputClass,
} from "../ui";
import { SEVERITIES } from "../types";

export default function NewIncidentPage() {
  const [title, setTitle] = useState("");
  const [service, setService] = useState("");
  const [severity, setSeverity] = useState("sev2");
  const [commander, setCommander] = useState("");
  const [impactSummary, setImpactSummary] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      const incident = await api.createIncident({
        title: title.trim(),
        service: service.trim(),
        severity,
        commander: commander.trim(),
        impact_summary: impactSummary.trim(),
      });
      navigate(`/incidents/${incident.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFieldErrors(err.errors);
      } else {
        setError("Could not open the incident");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
      <button type="button" onClick={() => navigate("/incidents")} className={buttonGhost}>
        ← Back to incidents
      </button>

      <Card className="mt-4 p-6">
        <h1 className="text-2xl font-bold text-slate-50">Open incident</h1>
        <p className="mt-1 text-sm text-slate-400">
          The incident starts in <span className="font-medium">investigating</span> and the
          resolution target follows the severity you pick.
        </p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <ErrorBanner message={error} errors={fieldErrors} />

          <Field label="Title" error={fieldErrors.title}>
            <input
              className={inputClass}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Checkout latency spike"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Service" error={fieldErrors.service}>
              <input
                className={inputClass}
                value={service}
                onChange={(event) => setService(event.target.value)}
                placeholder="checkout"
              />
            </Field>
            <Field label="Severity" error={fieldErrors.severity}>
              <select
                className={inputClass}
                value={severity}
                onChange={(event) => setSeverity(event.target.value)}
              >
                {SEVERITIES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Commander" error={fieldErrors.commander}>
            <input
              className={inputClass}
              value={commander}
              onChange={(event) => setCommander(event.target.value)}
              placeholder="Incident commander"
            />
          </Field>

          <Field label="Impact summary" error={fieldErrors.impact_summary}>
            <textarea
              className={`${inputClass} min-h-28`}
              value={impactSummary}
              onChange={(event) => setImpactSummary(event.target.value)}
              placeholder="Who is affected and how?"
            />
          </Field>

          <div className="flex items-center gap-3 pt-2">
            <button type="submit" className={buttonPrimary} disabled={busy}>
              {busy ? "Opening…" : "Open incident"}
            </button>
            <button
              type="button"
              className={buttonGhost}
              onClick={() => navigate("/incidents")}
              disabled={busy}
            >
              Cancel
            </button>
          </div>
        </form>

        <div className="mt-6 border-t border-slate-800 pt-4">
          <SectionTitle>Resolution targets</SectionTitle>
          <ul className="mt-2 space-y-1 text-sm text-slate-400">
            <li>sev1 — 60 minutes</li>
            <li>sev2 — 240 minutes</li>
            <li>sev3 — 1440 minutes</li>
            <li>sev4 — 4320 minutes</li>
          </ul>
        </div>
      </Card>
    </div>
  );
}

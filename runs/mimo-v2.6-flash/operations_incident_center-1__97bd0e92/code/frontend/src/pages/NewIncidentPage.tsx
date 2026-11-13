import { useState, type FormEvent } from "react";
import { api, ApiError, type Incident, type Severity } from "../api";
import { navigate } from "../router";
import {
  ErrorAlert,
  Field,
  PageHeader,
  SEVERITIES,
  buttonPrimaryClass,
  buttonSecondaryClass,
  inputClass,
} from "../ui";

export default function NewIncidentPage() {
  const [title, setTitle] = useState("");
  const [service, setService] = useState("");
  const [severity, setSeverity] = useState<Severity>("sev1");
  const [commander, setCommander] = useState("");
  const [impactSummary, setImpactSummary] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      const incident = await api<Incident>("/api/incidents", {
        method: "POST",
        body: {
          title,
          service,
          severity,
          commander,
          impact_summary: impactSummary,
        },
      });
      navigate(`/incidents/${incident.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFieldErrors(err.errors);
      } else {
        setError((err as Error).message);
      }
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Open incident" />

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-500">
          The incident opens in <span className="font-semibold">investigating</span>{" "}
          status. Every team member can update it afterwards.
        </p>

        <div className="mt-4">
          <ErrorAlert message={error} />
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4" noValidate>
          <Field label="Title" error={fieldErrors.title}>
            <input
              className={inputClass}
              type="text"
              name="title"
              placeholder="Short description of the incident"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Service" error={fieldErrors.service}>
              <input
                className={inputClass}
                type="text"
                name="service"
                placeholder="Affected service"
                value={service}
                onChange={(event) => setService(event.target.value)}
              />
            </Field>
            <Field label="Severity" error={fieldErrors.severity}>
              <select
                className={inputClass}
                name="severity"
                value={severity}
                onChange={(event) => setSeverity(event.target.value as Severity)}
              >
                {SEVERITIES.map((value) => (
                  <option key={value} value={value}>
                    {value.toUpperCase()}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Commander" error={fieldErrors.commander}>
            <input
              className={inputClass}
              type="text"
              name="commander"
              placeholder="Person driving the response"
              value={commander}
              onChange={(event) => setCommander(event.target.value)}
            />
          </Field>

          <Field label="Impact summary" error={fieldErrors.impact_summary}>
            <textarea
              className={`${inputClass} min-h-[6rem]`}
              name="impact_summary"
              placeholder="Who is affected and how?"
              value={impactSummary}
              onChange={(event) => setImpactSummary(event.target.value)}
            />
          </Field>

          <div className="flex gap-3 pt-2">
            <button type="submit" className={buttonPrimaryClass} disabled={busy}>
              {busy ? "Opening…" : "Open incident"}
            </button>
            <button
              type="button"
              className={buttonSecondaryClass}
              onClick={() => navigate("/incidents")}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { api, ApiError, SEVERITIES, STATUSES, statusLabel } from "../api";
import {
  Alert,
  BreachBadge,
  Button,
  Card,
  FieldError,
  Label,
  PageHeading,
  Select,
  SeverityBadge,
  TextArea,
  TextInput,
} from "../components";
import type { Navigate } from "../App";

interface FormState {
  title: string;
  service: string;
  severity: string;
  commander: string;
  impact_summary: string;
}

const INITIAL: FormState = {
  title: "",
  service: "",
  severity: "sev2",
  commander: "",
  impact_summary: "",
};

export default function OpenIncidentView({ navigate }: { navigate: Navigate }) {
  const [form, setForm] = useState<FormState>(INITIAL);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const username = localStorage.getItem("incident-center-username");
    if (username) setForm((prev) => ({ ...prev, commander: prev.commander || username }));
  }, []);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setErrors({});
    setLoading(true);
    try {
      const incident = await api.createIncident(form);
      navigate({ name: "incident", id: incident.id });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setErrors(err.errors);
      } else {
        setError("Something went wrong. Please try again.");
      }
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeading
        title="Open incident"
        subtitle="New incidents start in the Investigating status."
        action={
          <Button variant="secondary" onClick={() => navigate({ name: "incidents" })}>
            ← Back to list
          </Button>
        }
      />

      <Card>
        <form onSubmit={submit} className="space-y-5" noValidate>
          {error && (
            <Alert>
              <p className="font-semibold">Could not open incident</p>
              <p className="mt-0.5">{error}</p>
            </Alert>
          )}

          <div>
            <Label htmlFor="title">Title <span className="text-red-500">*</span></Label>
            <TextInput
              id="title"
              value={form.title}
              onChange={(e) => update("title", e.target.value)}
              placeholder="e.g. Checkout API returning 500s"
            />
            <FieldError errors={errors} name="title" />
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <Label htmlFor="service">Service</Label>
              <TextInput
                id="service"
                value={form.service}
                onChange={(e) => update("service", e.target.value)}
                placeholder="e.g. payments"
              />
              <FieldError errors={errors} name="service" />
            </div>
            <div>
              <Label htmlFor="severity">Severity <span className="text-red-500">*</span></Label>
              <Select id="severity" value={form.severity} onChange={(e) => update("severity", e.target.value)}>
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    SEV {s.replace("sev", "")} — target {s === "sev1" ? "60" : s === "sev2" ? "240" : s === "sev3" ? "1440" : "4320"} min
                  </option>
                ))}
              </Select>
              <FieldError errors={errors} name="severity" />
            </div>
          </div>

          <div>
            <Label htmlFor="commander">Incident commander</Label>
            <TextInput
              id="commander"
              value={form.commander}
              onChange={(e) => update("commander", e.target.value)}
              placeholder="Who is leading the response?"
            />
            <FieldError errors={errors} name="commander" />
          </div>

          <div>
            <Label htmlFor="impact">Impact summary</Label>
            <TextArea
              id="impact"
              rows={4}
              value={form.impact_summary}
              onChange={(e) => update("impact_summary", e.target.value)}
              placeholder="Describe the customer impact, affected regions, and any known scope…"
            />
            <FieldError errors={errors} name="impact_summary" />
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-5">
            <Button type="submit" loading={loading}>Open incident</Button>
            <Button type="button" variant="ghost" onClick={() => setForm(INITIAL)}>Reset</Button>
            <span className="text-xs text-slate-400">All signed-in team members can edit any incident.</span>
          </div>
        </form>
      </Card>

      <Card className="mt-6 bg-slate-50">
        <h2 className="text-sm font-semibold text-slate-700">Resolution targets</h2>
        <ul className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600 sm:grid-cols-4">
          {SEVERITIES.map((s) => (
            <li key={s} className="flex items-center gap-2">
              <SeverityBadge severity={s} />
              <span className="font-mono">{s === "sev1" ? "60 min" : s === "sev2" ? "4 h" : s === "sev3" ? "24 h" : "72 h"}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-slate-500">
          The target is measured from the time the incident was opened, using its current severity. Statuses available:{" "}
          {STATUSES.map(statusLabel).join(", ")}. Breached incidents are flagged with <BreachBadge />.
        </p>
      </Card>
    </div>
  );
}

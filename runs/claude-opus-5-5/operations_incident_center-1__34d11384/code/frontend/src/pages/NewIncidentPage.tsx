import { useState, type FormEvent } from "react";
import { api, ApiError, SEVERITIES, type Incident } from "../api";
import { navigate } from "../router";
import { Card, ErrorBanner, FieldError, Link, buttonClass, inputClass } from "../ui";

export default function NewIncidentPage() {
  const [form, setForm] = useState({ title: "", service: "", severity: "", commander: "", impact_summary: "" });
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    const body: Record<string, string> = { title: form.title, service: form.service };
    if (form.severity) body.severity = form.severity;
    if (form.commander.trim()) body.commander = form.commander;
    if (form.impact_summary.trim()) body.impact_summary = form.impact_summary;
    try {
      const inc = await api<Incident>("/incidents", { method: "POST", body });
      navigate(`/incidents/${inc.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFieldErrors(err.errors);
      } else setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/incidents" className="text-sm text-indigo-600 hover:underline">
        ← Back to incidents
      </Link>
      <Card>
        <h1 className="mb-4 text-xl font-semibold">Open incident</h1>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <ErrorBanner message={error} />
          <div>
            <label htmlFor="title" className="mb-1 block text-sm font-medium text-slate-700">
              Title
            </label>
            <input id="title" className={inputClass} value={form.title} onChange={set("title")} />
            <FieldError message={fieldErrors.title} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="service" className="mb-1 block text-sm font-medium text-slate-700">
                Service
              </label>
              <input id="service" className={inputClass} value={form.service} onChange={set("service")} />
              <FieldError message={fieldErrors.service} />
            </div>
            <div>
              <label htmlFor="severity" className="mb-1 block text-sm font-medium text-slate-700">
                Severity
              </label>
              <select id="severity" className={inputClass} value={form.severity} onChange={set("severity")}>
                <option value="">Select severity…</option>
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <FieldError message={fieldErrors.severity} />
            </div>
          </div>
          <div>
            <label htmlFor="commander" className="mb-1 block text-sm font-medium text-slate-700">
              Commander <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <input id="commander" className={inputClass} value={form.commander} onChange={set("commander")} />
            <FieldError message={fieldErrors.commander} />
          </div>
          <div>
            <label htmlFor="impact_summary" className="mb-1 block text-sm font-medium text-slate-700">
              Impact summary <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <textarea
              id="impact_summary"
              rows={4}
              className={inputClass}
              value={form.impact_summary}
              onChange={set("impact_summary")}
            />
            <FieldError message={fieldErrors.impact_summary} />
          </div>
          <div className="flex justify-end">
            <button type="submit" className={buttonClass} disabled={busy}>
              Open incident
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}

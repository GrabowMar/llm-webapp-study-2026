import { useState, type FormEvent } from "react";
import { api, ApiError, SEVERITIES } from "./api";
import { navigate } from "./router";
import { btnCls, ErrorBox, Field, inputCls } from "./ui";

export function NewIncident() {
  const [form, setForm] = useState({
    title: "",
    service: "",
    severity: "sev3",
    commander: "",
    impact_summary: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm({ ...form, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const created = await api.createIncident(form);
      navigate(`/incidents/${created.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFields(err.fields);
      } else {
        setError("Unexpected error");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-4 text-2xl font-semibold">Open incident</h1>
      <form onSubmit={submit} className="space-y-4 rounded-lg bg-white p-5 shadow">
        {error && <ErrorBox>{error}</ErrorBox>}
        <Field label="Title" error={fields.title}>
          <input className={inputCls} value={form.title} onChange={set("title")} />
        </Field>
        <Field label="Service" error={fields.service}>
          <input className={inputCls} value={form.service} onChange={set("service")} />
        </Field>
        <Field label="Severity" error={fields.severity}>
          <select className={inputCls} value={form.severity} onChange={set("severity")}>
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {s.toUpperCase()}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Commander" error={fields.commander}>
          <input className={inputCls} value={form.commander} onChange={set("commander")} />
        </Field>
        <Field label="Impact summary" error={fields.impact_summary}>
          <textarea
            className={inputCls}
            rows={3}
            value={form.impact_summary}
            onChange={set("impact_summary")}
          />
        </Field>
        <button className={btnCls} disabled={busy}>
          Open incident
        </button>
      </form>
    </div>
  );
}

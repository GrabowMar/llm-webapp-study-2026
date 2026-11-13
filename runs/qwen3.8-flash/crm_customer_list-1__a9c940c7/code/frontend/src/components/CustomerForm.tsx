import { useState, type FormEvent } from "react";
import type { Customer, CustomerInput } from "../types";
import { ErrorBanner, Field, inputClass } from "../ui";

const EMPTY: CustomerInput = { name: "", email: "", phone: "", company: "", notes: "" };

export default function CustomerForm({
  initial,
  submitLabel,
  error,
  busy,
  onSubmit,
  onCancel,
}: {
  initial?: Customer | null;
  submitLabel: string;
  error: string | null;
  busy: boolean;
  onSubmit: (input: CustomerInput) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<CustomerInput>(() =>
    initial
      ? {
          name: initial.name ?? "",
          email: initial.email ?? "",
          phone: initial.phone ?? "",
          company: initial.company ?? "",
          notes: initial.notes ?? "",
        }
      : EMPTY,
  );

  function set<K extends keyof CustomerInput>(key: K, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await onSubmit(values);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="Name *">
        <input
          value={values.name}
          onChange={(e) => set("name", e.target.value)}
          required
          className={inputClass}
          placeholder="Jane Doe"
        />
      </Field>
      <Field label="Email">
        <input
          type="text"
          value={values.email}
          onChange={(e) => set("email", e.target.value)}
          className={inputClass}
          placeholder="jane@acme.com"
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Phone">
          <input
            value={values.phone}
            onChange={(e) => set("phone", e.target.value)}
            className={inputClass}
            placeholder="+1 555 0100"
          />
        </Field>
        <Field label="Company">
          <input
            value={values.company}
            onChange={(e) => set("company", e.target.value)}
            className={inputClass}
            placeholder="Acme Inc"
          />
        </Field>
      </div>
      <Field label="Notes">
        <textarea
          value={values.notes}
          onChange={(e) => set("notes", e.target.value)}
          rows={4}
          className={inputClass}
          placeholder="Anything the team should know"
        />
      </Field>

      <ErrorBanner>{error}</ErrorBanner>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-700 disabled:opacity-60"
        >
          {busy ? "Saving…" : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

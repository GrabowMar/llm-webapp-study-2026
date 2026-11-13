import { useState } from "react";
import { ApiError, fieldErrors } from "../api";

export interface EventFormValues {
  title: string;
  description: string;
  location: string;
  start_time: string;
  end_time: string;
}

const EMPTY: EventFormValues = {
  title: "",
  description: "",
  location: "",
  start_time: "",
  end_time: "",
};

export default function EventForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: Partial<EventFormValues>;
  submitLabel: string;
  onSubmit: (values: EventFormValues) => Promise<void>;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<EventFormValues>({
    ...EMPTY,
    ...initial,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function set<K extends keyof EventFormValues>(
    key: K,
    value: EventFormValues[K]
  ) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setFormError(null);
    setBusy(true);
    try {
      await onSubmit({
        ...values,
        description: values.description || "",
        location: values.location || "",
      });
    } catch (err) {
      if (err instanceof ApiError && err.body) {
        const fe = fieldErrors(err.body);
        if (Object.keys(fe).length) {
          setErrors(fe);
        } else {
          setFormError("Could not save the event.");
        }
      } else {
        setFormError("Could not save the event.");
      }
    } finally {
      setBusy(false);
    }
  }

  const input =
    "w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200";
  const inputError = "border-red-400";
  const inputOk = "border-slate-300";

  function field(k: keyof EventFormValues) {
    return `${input} ${errors[k] ? inputError : inputOk}`;
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          Title
        </label>
        <input
          className={field("title")}
          value={values.title}
          onChange={(e) => set("title", e.target.value)}
          required
        />
        {errors.title && <FieldError msg={errors.title} />}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Start time
          </label>
          <input
            type="datetime-local"
            className={field("start_time")}
            value={values.start_time}
            onChange={(e) => set("start_time", e.target.value)}
            required
          />
          {errors.start_time && <FieldError msg={errors.start_time} />}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            End time
          </label>
          <input
            type="datetime-local"
            className={field("end_time")}
            value={values.end_time}
            onChange={(e) => set("end_time", e.target.value)}
            required
          />
          {errors.end_time && <FieldError msg={errors.end_time} />}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          Location
        </label>
        <input
          className={field("location")}
          value={values.location}
          onChange={(e) => set("location", e.target.value)}
          placeholder="Optional"
        />
        {errors.location && <FieldError msg={errors.location} />}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          Description
        </label>
        <textarea
          className={field("description")}
          rows={3}
          value={values.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder="Optional"
        />
        {errors.description && <FieldError msg={errors.description} />}
      </div>

      {formError && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          {formError}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

function FieldError({ msg }: { msg: string }) {
  return <p className="mt-1 text-xs text-red-600">{msg}</p>;
}

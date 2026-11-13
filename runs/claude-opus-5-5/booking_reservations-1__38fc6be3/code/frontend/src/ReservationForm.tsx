import { useEffect, useState, type FormEvent } from "react";
import { ApiError, type Reservation, type ReservationInput } from "./api";
import { Alert, Field, inputClass, primaryButton, secondaryButton } from "./ui";

export interface FormValues {
  name: string;
  email: string;
  date: string;
  time: string;
  party_size: string;
  notes: string;
}

export function emptyForm(date: string, time = ""): FormValues {
  return { name: "", email: "", date, time, party_size: "2", notes: "" };
}

export function fromReservation(r: Reservation): FormValues {
  return {
    name: r.name,
    email: r.email,
    date: r.date,
    time: r.time,
    party_size: String(r.party_size),
    notes: r.notes ?? "",
  };
}

export function ReservationForm({
  idPrefix,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  resetOnSuccess,
  successMessage,
}: {
  idPrefix: string;
  initial: FormValues;
  submitLabel: string;
  onSubmit: (input: ReservationInput) => Promise<void>;
  onCancel?: () => void;
  resetOnSuccess?: (values: FormValues) => FormValues;
  successMessage?: string;
}) {
  const [values, setValues] = useState<FormValues>(initial);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setValues((v) => ({ ...v, date: initial.date, time: initial.time || v.time }));
  }, [initial.date, initial.time]);

  const set = (key: keyof FormValues) => (e: { target: { value: string } }) => {
    setValues((v) => ({ ...v, [key]: e.target.value }));
    setSuccess(null);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setFieldErrors({});
    const sizeText = values.party_size.trim();
    const input = {
      name: values.name.trim(),
      email: values.email.trim(),
      date: values.date || null,
      time: values.time || null,
      party_size: sizeText === "" ? null : Number(sizeText),
    } as unknown as ReservationInput;
    if (values.notes.trim()) input.notes = values.notes.trim();
    setBusy(true);
    try {
      await onSubmit(input);
      if (successMessage) setSuccess(successMessage);
      if (resetOnSuccess) setValues(resetOnSuccess(values));
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        if (err.details) {
          const fe: Record<string, string> = {};
          for (const [k, v] of Object.entries(err.details)) if (typeof v === "string") fe[k] = v;
          setFieldErrors(fe);
        }
      } else {
        setError("Something went wrong");
      }
    } finally {
      setBusy(false);
    }
  }

  const id = (k: string) => `${idPrefix}-${k}`;
  const cls = (k: string) => `${inputClass} ${fieldErrors[k] ? "border-red-400" : ""}`;

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Name" htmlFor={id("name")}>
          <input id={id("name")} className={cls("name")} value={values.name} onChange={set("name")} autoComplete="name" required maxLength={100} />
        </Field>
        <Field label="Email" htmlFor={id("email")}>
          <input id={id("email")} type="email" className={cls("email")} value={values.email} onChange={set("email")} autoComplete="email" required />
        </Field>
        <Field label="Date" htmlFor={id("date")}>
          <input id={id("date")} type="date" className={cls("date")} value={values.date} onChange={set("date")} required />
        </Field>
        <Field label="Time" htmlFor={id("time")}>
          <input id={id("time")} type="time" className={cls("time")} value={values.time} onChange={set("time")} required />
        </Field>
        <Field label="Party size" htmlFor={id("party_size")}>
          <input
            id={id("party_size")}
            type="number"
            min={1}
            max={20}
            step={1}
            className={cls("party_size")}
            value={values.party_size}
            onChange={set("party_size")}
            required
          />
        </Field>
        <Field label="Notes (optional)" htmlFor={id("notes")}>
          <input id={id("notes")} className={cls("notes")} value={values.notes} onChange={set("notes")} maxLength={1000} placeholder="Allergies, high chair, …" />
        </Field>
      </div>
      {error && <Alert kind="error">{error}</Alert>}
      {success && <Alert kind="success">{success}</Alert>}
      <div className="flex gap-2">
        <button type="submit" className={primaryButton} disabled={busy}>
          {busy ? "Saving…" : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className={secondaryButton} onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

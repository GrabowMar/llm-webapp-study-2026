import { useState, type FormEvent } from "react";
import { api, type Reservation } from "./api";
import { ErrorMsg, Field, inputCls, primaryBtn, secondaryBtn } from "./ui";

export default function ReservationForm({
  existing,
  defaultDate,
  onSaved,
  onCancel,
}: {
  existing?: Reservation;
  defaultDate: string;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [email, setEmail] = useState(existing?.email ?? "");
  const [date, setDate] = useState(existing?.date ?? defaultDate);
  const [time, setTime] = useState(existing?.time ?? "19:00");
  const [size, setSize] = useState(String(existing?.party_size ?? 2));
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const input = {
      name,
      email,
      date,
      time,
      party_size: Number(size),
      notes: notes.trim() ? notes : undefined,
    };
    try {
      if (existing) await api.replace(existing.id, input);
      else await api.create(input);
      if (!existing) setNotes("");
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name">
          <input
            className={inputCls}
            value={name}
            required
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Email">
          <input
            className={inputCls}
            type="email"
            value={email}
            required
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Date">
          <input
            className={inputCls}
            type="date"
            value={date}
            required
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Field label="Time">
          <input
            className={inputCls}
            type="time"
            value={time}
            required
            onChange={(e) => setTime(e.target.value)}
          />
        </Field>
        <Field label="Party size">
          <input
            className={inputCls}
            type="number"
            min={1}
            max={20}
            value={size}
            required
            onChange={(e) => setSize(e.target.value)}
          />
        </Field>
      </div>
      <Field label="Notes">
        <textarea
          className={inputCls}
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </Field>
      <ErrorMsg message={error} />
      <div className="flex gap-2">
        <button className={primaryBtn} disabled={busy}>
          {existing ? "Save changes" : "Book table"}
        </button>
        {onCancel && (
          <button type="button" className={secondaryBtn} onClick={onCancel}>
            Discard
          </button>
        )}
      </div>
    </form>
  );
}

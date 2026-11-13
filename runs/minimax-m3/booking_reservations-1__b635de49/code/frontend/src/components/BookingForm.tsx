import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { ApiError, createReservation, updateReservation } from "../api";
import type { Reservation, ReservationInput } from "../api";
import {
  SLOT_TIMES,
  cardClass,
  cardTitleClass,
  dangerButtonClass,
  inputClass,
  labelClass,
  primaryButtonClass,
} from "../ui";

type Props = {
  selectedDate: string;
  editing: Reservation | null;
  onStartEdit: (reservation: Reservation | null) => void;
  onDateChange: (date: string) => void;
  onChanged: () => void;
};

const emptyForm = {
  name: "",
  email: "",
  time: "19:00",
  party_size: "2",
  notes: "",
};

export default function BookingForm({ selectedDate, editing, onStartEdit, onDateChange, onChanged }: Props) {
  const [name, setName] = useState(emptyForm.name);
  const [email, setEmail] = useState(emptyForm.email);
  const [date, setDate] = useState(selectedDate);
  const [time, setTime] = useState(emptyForm.time);
  const [partySize, setPartySize] = useState(emptyForm.party_size);
  const [notes, setNotes] = useState(emptyForm.notes);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDate(selectedDate);
  }, [selectedDate]);

  useEffect(() => {
    if (editing) {
      setName(editing.name);
      setEmail(editing.email);
      setDate(editing.date);
      setTime(editing.time);
      setPartySize(String(editing.party_size));
      setNotes(editing.notes);
      setMessage(null);
      setError(null);
    }
  }, [editing]);

  const slotOptions = useMemo(() => {
    const options = new Set(SLOT_TIMES);
    options.add(time);
    return Array.from(options).sort();
  }, [time]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setBusy(true);
    const payload: ReservationInput = {
      name: name.trim(),
      email: email.trim(),
      date,
      time,
      party_size: Number(partySize),
      notes: notes.trim(),
    };
    try {
      if (editing) {
        await updateReservation(editing.id, payload);
        setMessage("Reservation updated.");
      } else {
        await createReservation(payload);
        setMessage("Reservation confirmed.");
      }
      setName(emptyForm.name);
      setEmail(emptyForm.email);
      setNotes(emptyForm.notes);
      setPartySize(emptyForm.party_size);
      onStartEdit(null);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={cardClass} aria-labelledby="booking-heading">
      <h2 id="booking-heading" className={cardTitleClass}>
        {editing ? "Edit reservation" : "Book a table"}
      </h2>
      <p className="mt-1 text-sm text-stone-500">
        {editing
          ? `Changing reservation #${editing.id}. Saving replaces every field of the booking.`
          : "Each slot seats up to 20 guests in total."}
      </p>

      <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="guest-name">
              Name
            </label>
            <input
              id="guest-name"
              name="name"
              className={inputClass}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ada Lovelace"
              required
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="guest-email">
              Email
            </label>
            <input
              id="guest-email"
              name="email"
              type="email"
              className={inputClass}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="ada@example.com"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className={labelClass} htmlFor="booking-date">
              Date
            </label>
            <input
              id="booking-date"
              name="date"
              type="date"
              className={inputClass}
              value={date}
              onChange={(event) => setDate(event.target.value)}
              required
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="booking-time">
              Time
            </label>
            <select
              id="booking-time"
              name="time"
              className={inputClass}
              value={time}
              onChange={(event) => setTime(event.target.value)}
              required
            >
              {slotOptions.map((slot) => (
                <option key={slot} value={slot}>
                  {slot}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="party-size">
              Party size
            </label>
            <input
              id="party-size"
              name="party_size"
              type="number"
              min={1}
              max={20}
              className={inputClass}
              value={partySize}
              onChange={(event) => setPartySize(event.target.value)}
              required
            />
          </div>
        </div>

        <div>
          <label className={labelClass} htmlFor="notes">
            Notes
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            className={`${inputClass} resize-y`}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Window table, birthday celebration…"
          />
        </div>

        {error ? (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        {message ? (
          <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {message}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <button type="submit" className={primaryButtonClass} disabled={busy}>
            {busy ? "Please wait…" : editing ? "Save changes" : "Book table"}
          </button>
          {editing ? (
            <button type="button" className={dangerButtonClass} onClick={() => onStartEdit(null)} disabled={busy}>
              Cancel edit
            </button>
          ) : null}
        </div>
      </form>
    </section>
  );
}

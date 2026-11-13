import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../api";
import type { Reservation, ReservationDraft, Slot } from "../types";
import {
  card,
  errorPanel,
  formatDay,
  heading,
  input,
  label,
  primaryButton,
  secondaryButton,
  smallMuted,
  successPanel,
} from "../ui";

interface Props {
  editing: Reservation | null;
  seed: { date: string; time: string; nonce: number };
  slots: Slot[];
  day: string;
  onSaved: () => void;
  onCancelEdit: () => void;
  onUnauthorized?: () => void;
}

interface Message {
  kind: "success" | "error";
  text: string;
}

export default function BookingForm({
  editing,
  seed,
  slots,
  day,
  onSaved,
  onCancelEdit,
  onUnauthorized,
}: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [date, setDate] = useState(seed.date);
  const [time, setTime] = useState(seed.time);
  const [partySize, setPartySize] = useState("2");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState<Message | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDate(seed.date);
    setTime(seed.time);
    setMessage(null);
  }, [seed.nonce, seed.date, seed.time]);

  useEffect(() => {
    if (editing) {
      setName(editing.name);
      setEmail(editing.email);
      setDate(editing.date);
      setTime(editing.time);
      setPartySize(String(editing.party_size));
      setNotes(editing.notes ?? "");
      setMessage(null);
    } else {
      setName("");
      setEmail("");
      setPartySize("2");
      setNotes("");
    }
  }, [editing]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const size = Number(partySize);
    if (!name.trim() || !email.trim() || !date || !time) {
      setMessage({ kind: "error", text: "Fill in every required field." });
      return;
    }
    if (!Number.isInteger(size) || size < 1) {
      setMessage({ kind: "error", text: "Party size must be a positive whole number." });
      return;
    }
    const body: ReservationDraft = {
      name: name.trim(),
      email: email.trim(),
      date,
      time,
      party_size: size,
      notes: notes.trim() ? notes.trim() : null,
    };
    setBusy(true);
    setMessage(null);
    try {
      if (editing) {
        await api(`/api/reservations/${editing.id}`, { method: "PUT", body });
        setMessage({ kind: "success", text: "Reservation updated." });
        onCancelEdit();
      } else {
        await api("/api/reservations", { method: "POST", body });
        setMessage({ kind: "success", text: `Table booked for ${date} at ${time}.` });
        setName("");
        setEmail("");
        setNotes("");
      }
      onSaved();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        onUnauthorized?.();
        return;
      }
      setMessage({
        kind: "error",
        text: cause instanceof ApiError ? cause.message : "Something went wrong",
      });
    } finally {
      setBusy(false);
    }
  }

  const slot = date === day ? slots.find((item) => item.time === time) : undefined;

  return (
    <section className={card} aria-label="Booking form">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className={heading}>{editing ? "Edit reservation" : "Book a table"}</h2>
          {editing && (
            <p className={smallMuted}>
              Reservation #{editing.id} · {formatDay(editing.date)} at {editing.time}
            </p>
          )}
        </div>
        {editing && (
          <button className={secondaryButton} type="button" onClick={onCancelEdit}>
            Cancel edit
          </button>
        )}
      </div>

      {message && (
        <p
          className={`${message.kind === "success" ? successPanel : errorPanel} mb-4`}
          role="alert"
        >
          {message.text}
        </p>
      )}

      <form className="space-y-4" onSubmit={submit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="booking-name">
              Name
            </label>
            <input
              className={input}
              id="booking-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </div>
          <div>
            <label className={label} htmlFor="booking-email">
              Email
            </label>
            <input
              className={input}
              id="booking-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          <div>
            <label className={label} htmlFor="booking-date">
              Date
            </label>
            <input
              className={input}
              id="booking-date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              required
            />
          </div>
          <div>
            <label className={label} htmlFor="booking-time">
              Time
            </label>
            <input
              className={input}
              id="booking-time"
              type="time"
              value={time}
              onChange={(event) => setTime(event.target.value)}
              required
            />
          </div>
          <div>
            <label className={label} htmlFor="booking-party">
              Party size
            </label>
            <input
              className={input}
              id="booking-party"
              type="number"
              min={1}
              value={partySize}
              onChange={(event) => setPartySize(event.target.value)}
              required
            />
            {slot && (
              <p
                className={`${smallMuted} mt-1 ${
                  slot.remaining === 0 ? "font-medium text-red-600" : ""
                }`}
              >
                {slot.remaining === 0
                  ? "This time slot is full"
                  : `${slot.remaining} of 20 seats remaining at ${time}`}
              </p>
            )}
          </div>
          <div>
            <label className={label} htmlFor="booking-notes">
              Notes
            </label>
            <input
              className={input}
              id="booking-notes"
              placeholder="Allergies, occasion, seating…"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button className={primaryButton} type="submit" disabled={busy}>
            {busy
              ? "Saving…"
              : editing
                ? "Save changes"
                : "Book table"}
          </button>
          <span className={smallMuted}>Each time slot seats at most 20 guests.</span>
        </div>
      </form>
    </section>
  );
}

import { useState, type FormEvent } from "react";
import { createReservation } from "../api";
import type { ReservationInput } from "../types";
import { SLOT_CAPACITY } from "../config";
import Message from "./Message";

const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

export default function BookingForm({
  date,
  onDateChange,
  onBooked,
}: {
  date: string;
  onDateChange: (date: string) => void;
  onBooked: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [time, setTime] = useState("");
  const [partySize, setPartySize] = useState("2");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  const [kind, setKind] = useState<"ok" | "error">("ok");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setBusy(true);
    const input: ReservationInput = {
      name,
      email,
      date,
      time,
      party_size: Number(partySize),
      notes,
    };
    try {
      const res = await createReservation(input);
      setKind("ok");
      setMessage(
        `Booked ${res.party_size} guests on ${res.date} at ${res.time}.`,
      );
      setNotes("");
      onBooked();
    } catch (err) {
      setKind("error");
      setMessage(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold text-slate-800">
        Book a table
      </h2>
      <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">
            Name
          </span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">
            Email
          </span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">
            Date
          </span>
          <input
            type="date"
            value={date}
            onChange={(event) => onDateChange(event.target.value)}
            required
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">
            Time
          </span>
          <input
            type="time"
            value={time}
            onChange={(event) => setTime(event.target.value)}
            required
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">
            Party size
          </span>
          <input
            type="number"
            min={1}
            max={SLOT_CAPACITY}
            value={partySize}
            onChange={(event) => setPartySize(event.target.value)}
            required
            className={inputClass}
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-sm font-medium text-slate-700">
            Notes
          </span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={2}
            className={inputClass}
          />
        </label>
        <div className="sm:col-span-2">
          <Message kind={kind} text={message} />
        </div>
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            Book
          </button>
        </div>
      </form>
    </section>
  );
}

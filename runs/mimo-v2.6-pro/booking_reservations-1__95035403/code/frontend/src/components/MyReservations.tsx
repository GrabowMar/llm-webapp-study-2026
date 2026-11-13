import { useState, type FormEvent } from "react";
import { deleteReservation, updateReservation } from "../api";
import type { Reservation, ReservationInput } from "../types";
import { formatISO } from "../dates";
import { SLOT_CAPACITY } from "../config";
import Message from "./Message";

const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

function Editor({
  reservation,
  onFinish,
  onClose,
}: {
  reservation: Reservation;
  onFinish: (kind: "ok" | "error", message: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(reservation.name);
  const [email, setEmail] = useState(reservation.email);
  const [date, setDate] = useState(reservation.date);
  const [time, setTime] = useState(reservation.time);
  const [partySize, setPartySize] = useState(String(reservation.party_size));
  const [notes, setNotes] = useState(reservation.notes);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
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
      await updateReservation(reservation.id, input);
      onFinish("ok", "Reservation updated.");
    } catch (err) {
      onFinish(
        "error",
        err instanceof Error ? err.message : "Request failed",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 grid gap-2 sm:grid-cols-2">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600">
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
        <span className="mb-1 block text-xs font-medium text-slate-600">
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
        <span className="mb-1 block text-xs font-medium text-slate-600">
          Date
        </span>
        <input
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          required
          className={inputClass}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600">
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
        <span className="mb-1 block text-xs font-medium text-slate-600">
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
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600">
          Notes
        </span>
        <input
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          className={inputClass}
        />
      </label>
      <div className="flex gap-2 sm:col-span-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          Save changes
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
        >
          Close
        </button>
      </div>
    </form>
  );
}

export default function MyReservations({
  items,
  onChanged,
}: {
  items: Reservation[];
  onChanged: () => void;
}) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [kind, setKind] = useState<"ok" | "error">("ok");

  function report(k: "ok" | "error", text: string) {
    setKind(k);
    setMessage(text);
  }

  async function confirmCancel(id: number) {
    try {
      await deleteReservation(id);
      report("ok", "Reservation cancelled.");
      onChanged();
    } catch (err) {
      report("error", err instanceof Error ? err.message : "Request failed");
    } finally {
      setConfirmingId(null);
    }
  }

  const groups: [string, Reservation[]][] = [];
  for (const res of items) {
    const last = groups[groups.length - 1];
    if (last && last[0] === res.date) {
      last[1].push(res);
    } else {
      groups.push([res.date, [res]]);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold text-slate-800">
        My reservations
      </h2>
      <Message kind={kind} text={message} />
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">
          You have no reservations yet.
        </p>
      ) : (
        groups.map(([day, list]) => (
          <div key={day} className="mt-4">
            <h3 className="text-sm font-semibold text-slate-700">
              {formatISO(day)}
            </h3>
            <ul className="mt-2 space-y-2">
              {list.map((res) => (
                <li
                  key={res.id}
                  className="rounded-lg border border-slate-200 p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm text-slate-800">
                        <span className="font-medium">{res.time}</span> &middot;{" "}
                        {res.name} &middot; party of {res.party_size}
                      </p>
                      <p className="text-sm text-slate-500">{res.email}</p>
                      {res.notes ? (
                        <p className="text-sm text-slate-500">
                          Notes: {res.notes}
                        </p>
                      ) : null}
                      <p className="text-xs text-slate-400">
                        Booked at {res.created_at}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmingId(null);
                          setEditingId(editingId === res.id ? null : res.id);
                        }}
                        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
                      >
                        {editingId === res.id ? "Close" : "Edit"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(null);
                          setConfirmingId(res.id);
                        }}
                        className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>

                  {confirmingId === res.id ? (
                    <div className="mt-3 rounded-md bg-red-50 p-3">
                      <p className="text-sm text-red-800">
                        Cancel this reservation? The seats will be freed.
                      </p>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => confirmCancel(res.id)}
                          className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
                        >
                          Yes, cancel it
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingId(null)}
                          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
                        >
                          Keep reservation
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {editingId === res.id ? (
                    <Editor
                      reservation={res}
                      onFinish={(finishedKind, text) => {
                        setEditingId(null);
                        report(finishedKind, text);
                        if (finishedKind === "ok") onChanged();
                      }}
                      onClose={() => setEditingId(null)}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}

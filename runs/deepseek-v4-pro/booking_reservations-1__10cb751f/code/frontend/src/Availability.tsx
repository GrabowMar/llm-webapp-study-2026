import { FormEvent, useEffect, useState } from "react";
import {
  api,
  ApiError,
  Availability,
  AvailabilityItem,
  ReservationInput,
} from "./api";
import { Button, Card, ErrorBox, Spinner, SuccessBox, TextArea, TextInput } from "./ui";

export const SLOT_TIMES = [
  "17:00",
  "17:30",
  "18:00",
  "18:30",
  "19:00",
  "19:30",
  "20:00",
  "20:30",
  "21:00",
  "21:30",
];

function todayISO(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 10);
}

function fullSlotOptions(
  items: AvailabilityItem[],
  partySize: number
): Set<string> {
  const full = new Set<string>();
  for (const it of items) {
    if (it.remaining < partySize) full.add(it.time);
  }
  return full;
}

function BookingForm({
  date,
  availability,
  initial,
  onSaved,
  onCancel,
}: {
  date: string;
  availability: Availability;
  initial?: ReservationInput & { id: number };
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [time, setTime] = useState(initial?.time ?? SLOT_TIMES[0]);
  const [partySize, setPartySize] = useState(initial?.party_size ?? 2);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const full = fullSlotOptions(availability.items, partySize);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const payload: ReservationInput = {
      name,
      email,
      date,
      time,
      party_size: partySize,
      notes: notes || null,
    };
    try {
      if (initial) {
        await api.updateReservation(initial.id, payload);
      } else {
        await api.createReservation(payload);
      }
      if (!initial) {
        setName("");
        setEmail("");
        setNotes("");
        setTime(SLOT_TIMES[0]);
        setPartySize(2);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unexpected error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <ErrorBox message={error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <TextInput
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <TextInput label="Date" value={date} disabled />
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">
              Time
            </span>
            <select
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            >
              {SLOT_TIMES.map((t) => {
                const item = availability.items.find((i) => i.time === t);
                const remaining = item ? item.remaining : 20;
                return (
                  <option
                    key={t}
                    value={t}
                    disabled={full.has(t) && t !== initial?.time}
                  >
                    {t} ({remaining} left)
                  </option>
                );
              })}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">
              Party size
            </span>
            <select
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm"
              value={partySize}
              onChange={(e) => setPartySize(Number(e.target.value))}
            >
              {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <TextArea
        label="Notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {initial ? "Save changes" : "Book table"}
        </Button>
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

export default function AvailabilityPanel({
  date,
  onDateChange,
  onBooked,
  refreshTrigger,
}: {
  date: string;
  onDateChange: (d: string) => void;
  onBooked: () => void;
  refreshTrigger: number;
}) {
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .availability(date)
      .then((data) => {
        if (!cancelled) setAvailability(data);
      })
      .catch((err) => {
        if (!cancelled)
          setError(err instanceof ApiError ? err.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [date, refreshTrigger]);

  return (
    <Card title="Availability">
      <div className="mb-4 flex items-center gap-2">
        <label className="text-sm font-medium text-gray-700">Day</label>
        <input
          type="date"
          className="rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm"
          value={date}
          onChange={(e) => onDateChange(e.target.value || todayISO())}
        />
      </div>

      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorBox message={error} />
      ) : (
        availability && (
          <div className="mb-6">
            {availability.items.length === 0 ? (
              <p className="text-sm text-gray-500">
                No reservations on this day yet. Every slot is fully open.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {availability.items.map((it) => (
                  <div
                    key={it.time}
                    className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2"
                  >
                    <span className="font-medium text-gray-800">{it.time}</span>
                    <span className="text-sm text-gray-600">
                      {it.booked} booked · {it.remaining} left
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      )}

      <h3 className="mb-3 text-sm font-semibold text-gray-800">
        Book a table
      </h3>
      <SuccessBox message={message} />
      {availability && (
        <BookingForm
          date={date}
          availability={availability}
          onSaved={() => {
            setMessage("Reservation confirmed.");
            onBooked();
          }}
        />
      )}
    </Card>
  );
}

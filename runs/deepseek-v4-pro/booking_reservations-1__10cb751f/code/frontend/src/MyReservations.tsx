import { useEffect, useState } from "react";
import {
  api,
  ApiError,
  Reservation,
  ReservationInput,
} from "./api";
import { SLOT_TIMES } from "./Availability";
import { Button, Card, ErrorBox, Spinner, TextArea, TextInput } from "./ui";

interface Group {
  date: string;
  reservations: Reservation[];
}

function groupByDate(items: Reservation[]): Group[] {
  const map = new Map<string, Reservation[]>();
  for (const r of items) {
    const list = map.get(r.date) ?? [];
    list.push(r);
    map.set(r.date, list);
  }
  return Array.from(map.entries()).map(([date, reservations]) => ({
    date,
    reservations,
  }));
}

function EditForm({
  reservation,
  onSaved,
  onCancel,
}: {
  reservation: Reservation;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(reservation.name);
  const [email, setEmail] = useState(reservation.email);
  const [date, setDate] = useState(reservation.date);
  const [time, setTime] = useState(reservation.time);
  const [partySize, setPartySize] = useState(reservation.party_size);
  const [notes, setNotes] = useState(reservation.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
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
      await api.updateReservation(reservation.id, payload);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unexpected error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 rounded-md border border-blue-200 bg-blue-50 p-4">
      <ErrorBox message={error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <TextInput
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <TextInput
          label="Date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
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
              {SLOT_TIMES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
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
        <Button onClick={submit} disabled={busy}>
          Save changes
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function ReservationRow({
  reservation,
  onChanged,
}: {
  reservation: Reservation;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function cancel() {
    setError(null);
    setBusy(true);
    try {
      await api.deleteReservation(reservation.id);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unexpected error");
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <EditForm
        reservation={reservation}
        onSaved={() => {
          setEditing(false);
          onChanged();
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="rounded-md border border-gray-200 px-4 py-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-800">{reservation.time}</span>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
              party of {reservation.party_size}
            </span>
          </div>
          <div className="mt-1 text-sm text-gray-600">
            {reservation.name} · {reservation.email}
          </div>
          {reservation.notes && (
            <div className="mt-1 text-sm text-gray-500">
              Notes: {reservation.notes}
            </div>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          {!confirming ? (
            <>
              <Button
                variant="secondary"
                onClick={() => setEditing(true)}
              >
                Edit
              </Button>
              <Button variant="danger" onClick={() => setConfirming(true)}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              <span className="self-center text-sm text-gray-600">
                Cancel reservation?
              </span>
              <Button variant="danger" onClick={cancel} disabled={busy}>
                Yes
              </Button>
              <Button
                variant="secondary"
                onClick={() => setConfirming(false)}
              >
                No
              </Button>
            </>
          )}
        </div>
      </div>
      {error && (
        <div className="mt-2">
          <ErrorBox message={error} />
        </div>
      )}
    </div>
  );
}

export default function MyReservations({
  refreshTrigger,
  onChanged,
}: {
  refreshTrigger: number;
  onChanged: () => void;
}) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .listReservations()
      .then((data) => {
        if (!cancelled) setGroups(groupByDate(data.items));
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
  }, [refreshTrigger]);

  function reload() {
    onChanged();
  }

  return (
    <Card title="My reservations">
      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorBox message={error} />
      ) : groups.length === 0 ? (
        <p className="text-sm text-gray-500">You have no reservations.</p>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <div key={g.date}>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
                {g.date}
              </h3>
              <div className="space-y-3">
                {g.reservations.map((r) => (
                  <ReservationRow
                    key={r.id}
                    reservation={r}
                    onChanged={reload}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

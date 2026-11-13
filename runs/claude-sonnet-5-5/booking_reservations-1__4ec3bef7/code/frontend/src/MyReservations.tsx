import { useEffect, useState } from "react";
import { api, type Reservation } from "./api";
import ReservationForm from "./ReservationForm";
import { Card, dangerBtn, ErrorMsg, secondaryBtn } from "./ui";

export default function MyReservations({
  refreshKey,
  onChanged,
}: {
  refreshKey: number;
  onChanged: () => void;
}) {
  const [items, setItems] = useState<Reservation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    api
      .list()
      .then((r) => {
        if (live) {
          setItems(r.items);
          setError(null);
        }
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [refreshKey]);

  async function cancel(r: Reservation) {
    if (!window.confirm(`Cancel the reservation for ${r.name} on ${r.date} at ${r.time}?`)) return;
    setError(null);
    try {
      await api.cancel(r.id);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const groups = new Map<string, Reservation[]>();
  for (const r of items) groups.set(r.date, [...(groups.get(r.date) ?? []), r]);

  return (
    <Card title="My reservations">
      <ErrorMsg message={error} />
      {items.length === 0 && !error && (
        <p className="text-sm text-slate-600">You have no reservations.</p>
      )}
      <div className="space-y-5">
        {[...groups.entries()].map(([date, list]) => (
          <div key={date}>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
              {date}
            </h3>
            <ul className="space-y-2">
              {list.map((r) => (
                <li key={r.id} className="rounded-md border border-slate-200 p-3">
                  {editing === r.id ? (
                    <ReservationForm
                      existing={r}
                      defaultDate={r.date}
                      onCancel={() => setEditing(null)}
                      onSaved={() => {
                        setEditing(null);
                        onChanged();
                      }}
                    />
                  ) : (
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="text-sm">
                        <p className="font-medium text-slate-900">
                          {r.time} · {r.name} · {r.party_size}{" "}
                          {r.party_size === 1 ? "guest" : "guests"}
                        </p>
                        <p className="text-slate-600">{r.email}</p>
                        {r.notes && <p className="mt-1 text-slate-600">{r.notes}</p>}
                      </div>
                      <div className="flex gap-2">
                        <button className={secondaryBtn} onClick={() => setEditing(r.id)}>
                          Edit
                        </button>
                        <button className={dangerBtn} onClick={() => cancel(r)}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  );
}

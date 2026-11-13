import { useState } from "react";
import { api, formatDate, type Reservation } from "./api";
import { fromReservation, ReservationForm } from "./ReservationForm";
import { Alert, Card, dangerButton, secondaryButton } from "./ui";

export function MyReservations({
  reservations,
  loading,
  error,
  onChanged,
}: {
  reservations: Reservation[];
  loading: boolean;
  error: string | null;
  onChanged: (message?: string) => void;
}) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const groups = new Map<string, Reservation[]>();
  for (const r of reservations) {
    const list = groups.get(r.date) ?? [];
    list.push(r);
    groups.set(r.date, list);
  }

  async function cancel(r: Reservation) {
    const ok = window.confirm(
      `Cancel the reservation for ${r.name} (${r.party_size} guest${r.party_size === 1 ? "" : "s"}) on ${formatDate(r.date)} at ${r.time}?`,
    );
    if (!ok) return;
    setActionError(null);
    setNotice(null);
    setBusyId(r.id);
    try {
      await api.deleteReservation(r.id);
      if (editingId === r.id) setEditingId(null);
      setNotice("Reservation cancelled.");
      onChanged();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not cancel the reservation");
      onChanged();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card title="My reservations">
      {error && <Alert kind="error">{error}</Alert>}
      {actionError && <div className="mb-3"><Alert kind="error">{actionError}</Alert></div>}
      {notice && <div className="mb-3"><Alert kind="success">{notice}</Alert></div>}
      {!error && loading && reservations.length === 0 && <p className="text-sm text-stone-500">Loading…</p>}
      {!error && !loading && reservations.length === 0 && (
        <p className="text-sm text-stone-500">You have no reservations yet.</p>
      )}
      <div className="flex flex-col gap-5">
        {[...groups.entries()].map(([date, items]) => (
          <div key={date}>
            <h3 className="mb-2 border-b border-stone-200 pb-1 text-sm font-semibold uppercase tracking-wide text-stone-500">
              {formatDate(date)}
            </h3>
            <ul className="flex flex-col gap-2">
              {items.map((r) => (
                <li key={r.id} className="rounded-lg border border-stone-200 p-3">
                  {editingId === r.id ? (
                    <ReservationForm
                      idPrefix={`edit-${r.id}`}
                      initial={fromReservation(r)}
                      submitLabel="Save changes"
                      onCancel={() => setEditingId(null)}
                      onSubmit={async (input) => {
                        await api.updateReservation(r.id, input);
                        setEditingId(null);
                        setNotice("Reservation updated.");
                        onChanged();
                      }}
                    />
                  ) : (
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="text-sm">
                        <div className="flex items-baseline gap-2">
                          <span className="font-mono text-base font-semibold text-stone-900">{r.time}</span>
                          <span className="font-medium text-stone-800">{r.name}</span>
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                            {r.party_size} guest{r.party_size === 1 ? "" : "s"}
                          </span>
                        </div>
                        <div className="text-stone-500">{r.email}</div>
                        {r.notes && <div className="mt-1 text-stone-600 italic">“{r.notes}”</div>}
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className={secondaryButton}
                          onClick={() => {
                            setEditingId(r.id);
                            setNotice(null);
                            setActionError(null);
                          }}
                          disabled={busyId === r.id}
                        >
                          Edit
                        </button>
                        <button type="button" className={dangerButton} onClick={() => void cancel(r)} disabled={busyId === r.id}>
                          {busyId === r.id ? "Cancelling…" : "Cancel"}
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

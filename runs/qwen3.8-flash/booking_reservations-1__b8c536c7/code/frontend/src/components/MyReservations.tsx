import { useState } from "react";
import { Reservation } from "../api";

export default function MyReservations({
  groups,
  loading,
  error,
  onEdit,
  onCancel,
  editingId,
}: {
  groups: [string, Reservation[]][];
  loading: boolean;
  error: string | null;
  onEdit: (r: Reservation) => void;
  onCancel: (r: Reservation) => Promise<void>;
  editingId: number | null;
}) {
  const [confirming, setConfirming] = useState<Reservation | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirmCancel() {
    if (!confirming) return;
    setBusy(true);
    setCancelError(null);
    try {
      await onCancel(confirming);
      setConfirming(null);
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : "Could not cancel.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-800">My reservations</h2>
      {error && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      {loading && <p className="mt-3 text-sm text-slate-500">Loading…</p>}
      {!loading && groups.length === 0 && !error && (
        <p className="mt-3 text-sm text-slate-500">
          You have no reservations yet. Book a table using the form above.
        </p>
      )}
      {!loading &&
        groups.map(([date, items]) => (
          <div key={date} className="mt-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              {date}
            </h3>
            <ul className="mt-2 space-y-2">
              {items.map((r) => (
                <li
                  key={r.id}
                  className={`rounded-lg border p-3 text-sm ${
                    editingId === r.id
                      ? "border-indigo-400 bg-indigo-50"
                      : "border-slate-200 bg-slate-50"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-semibold text-slate-800">{r.time}</span>
                      <span className="ml-2 text-slate-600">
                        {r.party_size} guest{r.party_size === 1 ? "" : "s"}
                      </span>
                      <p className="text-slate-500">
                        {r.name} · {r.email}
                      </p>
                      {r.notes && <p className="italic text-slate-400">“{r.notes}”</p>}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => onEdit(r)}
                        className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-white"
                      >
                        {editingId === r.id ? "Editing" : "Edit"}
                      </button>
                      <button
                        onClick={() => {
                          setConfirming(r);
                          setCancelError(null);
                        }}
                        className="rounded-md border border-red-200 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-lg">
            <h3 className="text-base font-semibold text-slate-800">
              Cancel this reservation?
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              {confirming.party_size} guest{confirming.party_size === 1 ? "" : "s"} on{" "}
              {confirming.date} at {confirming.time}. The seats will be freed.
            </p>
            {cancelError && (
              <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {cancelError}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setConfirming(null)}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
              >
                Keep it
              </button>
              <button
                onClick={confirmCancel}
                disabled={busy}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {busy ? "Cancelling…" : "Yes, cancel"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import type { Store } from "../types";

type StoreListProps = {
  stores: Store[];
  isAdmin: boolean;
  onEdit: (store: Store) => void;
  onDelete: (store: Store) => Promise<void>;
  emptyMessage?: string;
};

export default function StoreList({
  stores,
  isAdmin,
  onEdit,
  onDelete,
  emptyMessage = "No stores match your search.",
}: StoreListProps) {
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(store: Store) {
    setBusyId(store.id);
    setError(null);
    try {
      await onDelete(store);
      setConfirmId(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete the store.");
    } finally {
      setBusyId(null);
    }
  }

  if (stores.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div>
      {error && (
        <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">
          {error}
        </p>
      )}
      <ul className="flex flex-col gap-3">
        {stores.map((store) => (
          <li
            key={store.id}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-base font-semibold text-slate-900">
                  {store.name}
                </h3>
                <p className="mt-1 text-sm text-slate-600">{store.address}</p>
                {store.phone && (
                  <p className="mt-1 text-sm text-slate-600">
                    <span className="sr-only">Phone: </span>
                    <a
                      href={`tel:${store.phone.replace(/\s+/g, "")}`}
                      className="text-slate-700 underline decoration-slate-300 underline-offset-2 hover:text-slate-900"
                    >
                      {store.phone}
                    </a>
                  </p>
                )}
              </div>
              {store.distance_km !== null && (
                <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                  {store.distance_km.toFixed(1)} km away
                </span>
              )}
            </div>
            {isAdmin && (
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                {confirmId === store.id ? (
                  <>
                    <span className="text-sm text-slate-600">Delete this store?</span>
                    <button
                      type="button"
                      onClick={() => handleDelete(store)}
                      disabled={busyId === store.id}
                      className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-rose-500 disabled:opacity-60"
                    >
                      {busyId === store.id ? "Deleting…" : "Yes, delete"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmId(null)}
                      className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => onEdit(store)}
                      className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-800 transition hover:bg-slate-200"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmId(store.id)}
                      className="rounded-lg px-3 py-1.5 text-sm font-medium text-rose-600 transition hover:bg-rose-50"
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

import type { Store } from "../api";

interface StoreListProps {
  stores: Store[];
  loading: boolean;
  error: string | null;
  admin: boolean;
  onEdit: (store: Store) => void;
  onDelete: (store: Store) => void;
  emptyMessage: string;
}

function formatDistance(distanceKm: number): string {
  if (distanceKm < 10) return `${distanceKm.toFixed(1)} km`;
  return `${Math.round(distanceKm)} km`;
}

export default function StoreList({
  stores,
  loading,
  error,
  admin,
  onEdit,
  onDelete,
  emptyMessage,
}: StoreListProps) {
  if (loading && stores.length === 0) {
    return (
      <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
        Loading stores…
      </p>
    );
  }

  if (error) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}
      </p>
    );
  }

  if (stores.length === 0) {
    return (
      <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
        {emptyMessage}
      </p>
    );
  }

  return (
    <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
      {stores.map((store) => (
        <li key={store.id} className="flex flex-wrap items-start gap-3 p-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-slate-900">{store.name}</h3>
              {store.distance_km !== null && (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                  {formatDistance(store.distance_km)}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-slate-600">{store.address}</p>
            <p className="mt-1 text-sm text-slate-500">
              {store.phone ?? <span className="text-slate-400">No phone listed</span>}
            </p>
          </div>
          {admin && (
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => onEdit(store)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => onDelete(store)}
                className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
              >
                Delete
              </button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

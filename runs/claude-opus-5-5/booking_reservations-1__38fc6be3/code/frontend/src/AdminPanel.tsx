import { useCallback, useEffect, useState } from "react";
import { api, ApiError, formatDate, type Reservation } from "./api";
import { Alert, Card, secondaryButton } from "./ui";

const PAGE_SIZE = 100;

export function AdminPanel({ date, refreshKey }: { date: string; refreshKey: number }) {
  const [items, setItems] = useState<Reservation[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const all: Reservation[] = [];
      let page = 1;
      let count = 0;
      for (;;) {
        const res = await api.adminReservations(date, page, PAGE_SIZE);
        all.push(...res.items);
        count = res.total;
        if (res.items.length < PAGE_SIZE || all.length >= res.total) break;
        page += 1;
      }
      setItems(all);
      setTotal(count);
    } catch (err) {
      setItems([]);
      setTotal(0);
      setError(err instanceof ApiError ? err.message : "Could not load reservations");
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const guests = items.reduce((sum, r) => sum + r.party_size, 0);

  return (
    <Card
      title={`All reservations · ${formatDate(date)}`}
      actions={
        <button type="button" className={secondaryButton} onClick={() => void load()} disabled={loading}>
          Refresh
        </button>
      }
    >
      <div className="mb-3 flex flex-wrap gap-4 text-sm">
        <div className="rounded-lg bg-stone-100 px-3 py-2">
          <span className="text-stone-500">Reservations</span>{" "}
          <span className="font-semibold text-stone-900" data-testid="admin-total">{total}</span>
        </div>
        <div className="rounded-lg bg-amber-100 px-3 py-2">
          <span className="text-amber-800">Total guests</span>{" "}
          <span className="font-semibold text-amber-900" data-testid="admin-guests">{guests}</span>
        </div>
      </div>
      {error && <Alert kind="error">{error}</Alert>}
      {!error && !loading && items.length === 0 && <p className="text-sm text-stone-500">No reservations on this day.</p>}
      {items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-stone-200 text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="py-2 pr-3">Time</th>
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Email</th>
                <th className="py-2 pr-3 text-right">Guests</th>
                <th className="py-2 pr-3">User</th>
                <th className="py-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id} className="border-b border-stone-100 last:border-0">
                  <td className="py-2 pr-3 font-mono">{r.time}</td>
                  <td className="py-2 pr-3">{r.name}</td>
                  <td className="py-2 pr-3 text-stone-600">{r.email}</td>
                  <td className="py-2 pr-3 text-right font-medium">{r.party_size}</td>
                  <td className="py-2 pr-3 text-stone-600">{r.username ?? "—"}</td>
                  <td className="py-2 text-stone-600">{r.notes ?? ""}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-stone-300 font-semibold">
                <td className="py-2 pr-3" colSpan={3}>
                  Total
                </td>
                <td className="py-2 pr-3 text-right">{guests}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Card>
  );
}

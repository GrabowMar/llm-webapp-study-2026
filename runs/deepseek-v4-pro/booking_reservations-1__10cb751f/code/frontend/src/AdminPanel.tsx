import { useEffect, useState } from "react";
import { api, ApiError, Reservation } from "./api";
import { Button, Card, ErrorBox, Spinner } from "./ui";

export default function AdminPanel({
  date,
  onDateChange,
  refreshTrigger,
}: {
  date: string;
  onDateChange: (d: string) => void;
  refreshTrigger: number;
}) {
  const [items, setItems] = useState<Reservation[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
  }, [date]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .adminReservations(date, page, pageSize)
      .then((data) => {
        if (cancelled) return;
        setItems(data.items);
        setTotal(data.total);
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
  }, [date, page, pageSize, refreshTrigger]);

  const guestTotal = items.reduce((sum, r) => sum + r.party_size, 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <Card
      title="All reservations (admin)"
      actions={
        <div className="flex items-center gap-3">
          {items.length > 0 && (
            <span className="text-sm text-gray-600">
              {guestTotal} guests on this page
            </span>
          )}
          <input
            type="date"
            className="rounded-md border border-gray-300 px-2 py-1 text-sm"
            value={date}
            onChange={(e) => onDateChange(e.target.value)}
          />
        </div>
      }
    >
      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorBox message={error} />
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-500">No reservations on this day.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500">
                  <th className="py-2 pr-4 font-medium">Time</th>
                  <th className="py-2 pr-4 font-medium">Name</th>
                  <th className="py-2 pr-4 font-medium">Email</th>
                  <th className="py-2 pr-4 font-medium">Party</th>
                  <th className="py-2 pr-4 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-gray-100 text-gray-700"
                  >
                    <td className="py-2 pr-4 font-medium">{r.time}</td>
                    <td className="py-2 pr-4">{r.name}</td>
                    <td className="py-2 pr-4">{r.email}</td>
                    <td className="py-2 pr-4">{r.party_size}</td>
                    <td className="py-2 pr-4 text-gray-500">
                      {r.notes ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
            <span>
              {total} total reservation{total === 1 ? "" : "s"}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Prev
              </Button>
              <span>
                Page {page} of {totalPages}
              </span>
              <Button
                variant="secondary"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

import { useEffect, useState } from "react";
import { api, type Reservation } from "./api";
import { Card, ErrorMsg } from "./ui";

const PAGE_SIZE = 100;

export default function AdminDay({ date, refreshKey }: { date: string; refreshKey: number }) {
  const [items, setItems] = useState<Reservation[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!date) {
      setItems([]);
      return;
    }
    let live = true;
    (async () => {
      const all: Reservation[] = [];
      let page = 1;
      for (;;) {
        const r = await api.adminList(date, page, PAGE_SIZE);
        all.push(...r.items);
        if (all.length >= r.total || r.items.length === 0) break;
        page += 1;
      }
      if (live) {
        setItems(all);
        setError(null);
      }
    })().catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [date, refreshKey]);

  const guests = items.reduce((sum, r) => sum + r.party_size, 0);

  return (
    <Card title={`All reservations on ${date || "…"}`}>
      <ErrorMsg message={error} />
      {items.length === 0 && !error && (
        <p className="text-sm text-slate-600">No reservations on this day.</p>
      )}
      {items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-slate-500">
              <tr>
                <th className="py-2 pr-4">Time</th>
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Email</th>
                <th className="py-2 pr-4">Guests</th>
                <th className="py-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id} className="border-b border-slate-100">
                  <td className="py-2 pr-4">{r.time}</td>
                  <td className="py-2 pr-4">{r.name}</td>
                  <td className="py-2 pr-4">{r.email}</td>
                  <td className="py-2 pr-4">{r.party_size}</td>
                  <td className="py-2 text-slate-600">{r.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-4 text-sm font-semibold text-slate-900">Guest total: {guests}</p>
    </Card>
  );
}

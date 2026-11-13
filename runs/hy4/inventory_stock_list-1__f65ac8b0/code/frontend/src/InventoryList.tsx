import { useEffect, useMemo, useState } from "react";
import { api, errorMessage } from "./api";
import type { Item, ItemList } from "./api";
import { Button, ErrorBanner, inputClass } from "./ui";

const PAGE_SIZE = 10;

export default function InventoryList({
  signedIn,
  onOpen,
  onAdd,
}: {
  signedIn: boolean;
  onOpen: (id: number) => void;
  onAdd: () => void;
}) {
  const [data, setData] = useState<ItemList | null>(null);
  const [locations, setLocations] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [location, setLocation] = useState("");
  const [lowStock, setLowStock] = useState(false);
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(q.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    api
      .listItems({ page: 1, page_size: 1000 })
      .then((result) => {
        const unique = Array.from(
          new Set(result.items.map((item) => item.location)),
        ).sort((a, b) => a.localeCompare(b));
        setLocations(unique);
      })
      .catch(() => undefined);
  }, [reloadKey]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api
      .listItems({
        q: search,
        location,
        low_stock: lowStock,
        page,
        page_size: PAGE_SIZE,
      })
      .then((result) => {
        if (active) setData(result);
      })
      .catch((err) => {
        if (active) setError(errorMessage(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [search, location, lowStock, page, reloadKey]);

  const totalPages = useMemo(
    () => (data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1),
    [data],
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Inventory</h1>
          <p className="text-sm text-slate-500">
            {data ? `${data.total} item${data.total === 1 ? "" : "s"}` : "Items in the warehouse"}
          </p>
        </div>
        {signedIn && <Button onClick={onAdd}>+ Add item</Button>}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block sm:col-span-2 lg:col-span-1">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Search
            </span>
            <input
              type="search"
              placeholder="Name or SKU…"
              className={inputClass}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Location
            </span>
            <select
              className={inputClass}
              value={location}
              onChange={(e) => {
                setLocation(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All locations</option>
              {locations.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-3 self-end rounded-md border border-slate-200 px-3 py-2">
            <input
              type="checkbox"
              className="h-4 w-4 accent-indigo-600"
              checked={lowStock}
              onChange={(e) => {
                setLowStock(e.target.checked);
                setPage(1);
              }}
            />
            <span className="text-sm font-medium text-slate-700">Low stock only</span>
          </label>
          <div className="self-end">
            <Button
              variant="ghost"
              onClick={() => {
                setQ("");
                setSearch("");
                setLocation("");
                setLowStock(false);
                setPage(1);
                setReloadKey((key) => key + 1);
              }}
            >
              Clear filters
            </Button>
          </div>
        </div>
      </div>

      <ErrorBanner message={error} />

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading && !data ? (
          <p className="px-5 py-12 text-center text-sm text-slate-500">Loading items…</p>
        ) : data && data.items.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-slate-500">
            No items match these filters.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-5 py-3 font-medium">SKU</th>
                  <th className="px-5 py-3 font-medium">Location</th>
                  <th className="px-5 py-3 font-medium">Quantity</th>
                  <th className="px-5 py-3 font-medium">Reorder level</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data?.items.map((item: Item) => (
                  <tr
                    key={item.id}
                    onClick={() => onOpen(item.id)}
                    className={`cursor-pointer transition hover:bg-indigo-50 ${
                      item.low_stock ? "bg-red-50" : ""
                    }`}
                  >
                    <td className="px-5 py-3 font-medium text-indigo-700 hover:underline">
                      {item.name}
                    </td>
                    <td className="px-5 py-3 text-slate-600">{item.sku}</td>
                    <td className="px-5 py-3 text-slate-600">{item.location}</td>
                    <td className="px-5 py-3 font-semibold text-slate-800">
                      {item.quantity}
                    </td>
                    <td className="px-5 py-3 text-slate-600">{item.reorder_level}</td>
                    <td className="px-5 py-3">
                      {item.low_stock ? (
                        <span className="inline-flex rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-700">
                          Low stock
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700">
                          OK
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-3 text-sm text-slate-600">
            <span>
              Page {data.page} of {totalPages} · {data.total} total
            </span>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

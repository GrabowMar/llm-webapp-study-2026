import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { listItems, listLocations, type Item } from "../api";
import { useAuth } from "../auth";
import { Badge, inputClass } from "../components/ui";

const PAGE_SIZE = 10;

export default function ItemListPage() {
  const { username } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const q = searchParams.get("q") ?? "";
  const location = searchParams.get("location") ?? "";
  const lowStock = searchParams.get("low_stock") === "true";
  const page = Math.max(Number(searchParams.get("page") ?? "1") || 1, 1);

  const [searchInput, setSearchInput] = useState(q);
  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [locations, setLocations] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    setSearchInput(q);
  }, [q]);

  const updateParams = useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams);
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === "") {
          next.delete(key);
        } else {
          next.set(key, value);
        }
      }
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  useEffect(() => {
    const handle = window.setTimeout(() => {
      if (searchInput !== q) {
        updateParams({ q: searchInput || null, page: null });
      }
    }, 300);
    return () => window.clearTimeout(handle);
  }, [searchInput, q, updateParams]);

  useEffect(() => {
    let active = true;
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    Promise.all([
      listItems({ q, location, low_stock: lowStock, page, page_size: PAGE_SIZE }),
      listLocations(),
    ])
      .then(([result, locs]) => {
        if (!active || id !== requestId.current) return;
        setItems(result.items);
        setTotal(result.total);
        setLocations(locs.items);
      })
      .catch((err: unknown) => {
        if (!active || id !== requestId.current) return;
        setError(err instanceof Error ? err.message : "Failed to load items.");
      })
      .finally(() => {
        if (active && id === requestId.current) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [q, location, lowStock, page]);

  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  const pageNumbers = useMemo(() => {
    const pages: number[] = [];
    const start = Math.max(1, Math.min(page - 2, totalPages - 4));
    const end = Math.min(totalPages, start + 4);
    for (let index = start; index <= end; index += 1) {
      pages.push(index);
    }
    return pages;
  }, [page, totalPages]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
          <p className="mt-1 text-sm text-slate-500">
            {total} {total === 1 ? "item" : "items"}
            {lowStock ? " at or below reorder level" : " in the warehouse"}
          </p>
        </div>
        {username && (
          <Link
            to="/items/new"
            className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            Add item
          </Link>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_200px_auto]">
          <div>
            <label htmlFor="search" className="sr-only">
              Search
            </label>
            <input
              id="search"
              type="search"
              placeholder="Search by name or SKU…"
              className={inputClass}
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="location" className="sr-only">
              Location
            </label>
            <select
              id="location"
              className={inputClass}
              value={location}
              onChange={(event) =>
                updateParams({
                  location: event.target.value || null,
                  page: null,
                })
              }
            >
              <option value="">All locations</option>
              {locations.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
          </div>
          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
              checked={lowStock}
              onChange={(event) =>
                updateParams({
                  low_stock: event.target.checked ? "true" : null,
                  page: null,
                })
              }
            />
            Low stock only
          </label>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3 text-right">Quantity</th>
                <th className="px-4 py-3 text-right">Reorder at</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                    Loading items…
                  </td>
                </tr>
              )}
              {!loading && items.length === 0 && !error && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                    No items match your filters.
                  </td>
                </tr>
              )}
              {items.map((item) => (
                <tr
                  key={item.id}
                  className={
                    item.low_stock
                      ? "bg-red-50 hover:bg-red-100"
                      : "hover:bg-slate-50"
                  }
                >
                  <td className="px-4 py-3 font-medium">
                    <Link
                      to={`/items/${item.id}`}
                      className="text-slate-900 hover:underline"
                    >
                      {item.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">
                    {item.sku}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {item.location || "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {item.quantity}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">
                    {item.reorder_level}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={item.low_stock ? "low" : "ok"}>
                      {item.low_stock ? "Low stock" : "In stock"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() =>
              updateParams({ page: String(Math.max(1, page - 1)) })
            }
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Previous
          </button>
          <div className="flex items-center gap-1">
            {pageNumbers.map((number) => (
              <button
                key={number}
                type="button"
                onClick={() => updateParams({ page: String(number) })}
                className={`h-8 w-8 rounded-md text-sm font-medium ${
                  number === page
                    ? "bg-slate-900 text-white"
                    : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {number}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() =>
              updateParams({ page: String(Math.min(totalPages, page + 1)) })
            }
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

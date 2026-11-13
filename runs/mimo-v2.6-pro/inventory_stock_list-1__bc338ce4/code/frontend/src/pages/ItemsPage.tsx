import { useEffect } from "react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { errorMessage } from "../api";
import { useAuth } from "../auth";
import type { ItemList } from "../types";
import { ErrorAlert } from "../ui";
import { InStockBadge } from "../ui";
import { LowStockBadge } from "../ui";
import { cardClass } from "../ui";
import { inputClass } from "../ui";
import { labelClass } from "../ui";
import { primaryButtonClass } from "../ui";
import { secondaryButtonClass } from "../ui";

const PAGE_SIZE = 10;

export default function ItemsPage() {
  const { token } = useAuth();
  const [q, setQ] = useState("");
  const [location, setLocation] = useState("");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ItemList | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (location.trim()) params.set("location", location.trim());
    if (lowStockOnly) params.set("low_stock", "true");
    params.set("page", String(page));
    params.set("page_size", String(PAGE_SIZE));

    const timer = window.setTimeout(() => {
      api<ItemList>(`/api/items?${params.toString()}`)
        .then((result) => {
          if (!cancelled) {
            setData(result);
            setError(null);
          }
        })
        .catch((err) => {
          if (!cancelled) setError(errorMessage(err));
        });
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [q, location, lowStockOnly, page]);

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageSize = data?.page_size ?? PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
        {token ? (
          <Link to="/items/new" className={primaryButtonClass}>
            Add item
          </Link>
        ) : (
          <Link to="/account" className={primaryButtonClass}>
            Sign in to manage items
          </Link>
        )}
      </div>

      <div className={`${cardClass} flex flex-wrap items-end gap-4`}>
        <div className="min-w-40 flex-1">
          <label htmlFor="search" className={labelClass}>
            Search
          </label>
          <input
            id="search"
            type="search"
            className={inputClass}
            placeholder="Search by name or SKU…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="min-w-40 flex-1">
          <label htmlFor="location-filter" className={labelClass}>
            Location
          </label>
          <input
            id="location-filter"
            className={inputClass}
            placeholder="Filter by location…"
            value={location}
            onChange={(e) => {
              setLocation(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <label
          htmlFor="low-stock-only"
          className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm"
        >
          <input
            id="low-stock-only"
            type="checkbox"
            className="h-4 w-4 accent-sky-600"
            checked={lowStockOnly}
            onChange={(e) => {
              setLowStockOnly(e.target.checked);
              setPage(1);
            }}
          />
          Low stock only
        </label>
      </div>

      <ErrorAlert message={error} />

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">SKU</th>
              <th className="px-4 py-3 font-semibold">Location</th>
              <th className="px-4 py-3 text-right font-semibold">Quantity</th>
              <th className="px-4 py-3 text-right font-semibold">Reorder level</th>
              <th className="px-4 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.id}
                className={
                  item.low_stock
                    ? "border-b border-red-100 bg-red-50 last:border-0 hover:bg-red-100"
                    : "border-b border-slate-100 last:border-0 hover:bg-slate-50"
                }
              >
                <td className="px-4 py-3">
                  <Link to={`/items/${item.id}`} className="font-medium text-sky-700 hover:underline">
                    {item.name}
                  </Link>
                </td>
                <td className="px-4 py-3 font-mono text-slate-600">{item.sku}</td>
                <td className="px-4 py-3 text-slate-600">{item.location || "—"}</td>
                <td className="px-4 py-3 text-right font-semibold">{item.quantity}</td>
                <td className="px-4 py-3 text-right text-slate-600">{item.reorder_level}</td>
                <td className="px-4 py-3">{item.low_stock ? <LowStockBadge /> : <InStockBadge />}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                  No items found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          {total} item{total === 1 ? "" : "s"} · page {data?.page ?? 1} of {totalPages}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            className={secondaryButtonClass}
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </button>
          <button
            type="button"
            className={secondaryButtonClass}
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

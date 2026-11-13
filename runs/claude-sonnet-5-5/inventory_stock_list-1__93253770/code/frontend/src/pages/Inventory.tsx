import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, type ItemPage } from "../api";
import { useAuth } from "../auth";
import { btnCls, btnSecondaryCls, ErrorBanner, inputCls, LowStockBadge } from "../ui";

const PAGE_SIZE = 10;

export default function Inventory() {
  const { username } = useAuth();
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const location = params.get("location") ?? "";
  const low = params.get("low_stock") === "true";
  const page = Math.max(1, Number(params.get("page")) || 1);

  const [search, setSearch] = useState(q);
  const [data, setData] = useState<ItemPage | null>(null);
  const [locations, setLocations] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  function update(changes: Record<string, string>) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace: true });
  }

  useEffect(() => {
    if (search === q) return;
    const t = setTimeout(() => update({ q: search.trim(), page: "" }), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    api.locations().then((r) => setLocations(r.items)).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .listItems({
        q,
        location,
        low_stock: low ? "true" : "",
        page: String(page),
        page_size: String(PAGE_SIZE),
      })
      .then((r) => {
        if (cancelled) return;
        setData(r);
        setError("");
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [q, location, low, page]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Inventory</h1>
        {username && (
          <Link to="/items/new" className={btnCls}>
            Add item
          </Link>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded bg-white p-3 shadow-sm">
        <input
          aria-label="Search"
          placeholder="Search name or SKU"
          className={inputCls + " max-w-xs"}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          aria-label="Location"
          className={inputCls + " max-w-[12rem]"}
          value={location}
          onChange={(e) => update({ location: e.target.value, page: "" })}
        >
          <option value="">All locations</option>
          {location && !locations.includes(location) && <option value={location}>{location}</option>}
          {locations.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            role="switch"
            aria-label="Low stock only"
            className="h-4 w-4 accent-indigo-600"
            checked={low}
            onChange={(e) => update({ low_stock: e.target.checked ? "true" : "", page: "" })}
          />
          Low stock only
        </label>
      </div>

      <ErrorBanner message={error} />

      <div className="overflow-x-auto rounded bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-100 text-xs uppercase text-slate-600">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">SKU</th>
              <th className="px-4 py-2">Location</th>
              <th className="px-4 py-2 text-right">Quantity</th>
              <th className="px-4 py-2 text-right">Reorder level</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((it) => (
              <tr
                key={it.id}
                data-low-stock={it.low_stock}
                className={
                  "border-b border-slate-100 " +
                  (it.low_stock ? "bg-red-50 text-red-900 hover:bg-red-100" : "hover:bg-slate-50")
                }
              >
                <td className="px-4 py-2 font-medium">
                  <Link to={`/items/${it.id}`} className="text-indigo-700 hover:underline">
                    {it.name}
                  </Link>{" "}
                  {it.low_stock && <LowStockBadge />}
                </td>
                <td className="px-4 py-2">{it.sku}</td>
                <td className="px-4 py-2">{it.location}</td>
                <td className="px-4 py-2 text-right tabular-nums">{it.quantity}</td>
                <td className="px-4 py-2 text-right tabular-nums">{it.reorder_level}</td>
              </tr>
            ))}
            {data && data.items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  No items found.
                </td>
              </tr>
            )}
            {!data && loading && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  Loading...
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {data && (
        <div className="flex items-center justify-between text-sm">
          <span>
            {data.total} item{data.total === 1 ? "" : "s"} - page {data.page} of {pages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              className={btnSecondaryCls}
              disabled={page <= 1}
              onClick={() => update({ page: page - 1 > 1 ? String(page - 1) : "" })}
            >
              Previous
            </button>
            <button
              type="button"
              className={btnSecondaryCls}
              disabled={page >= pages}
              onClick={() => update({ page: String(page + 1) })}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

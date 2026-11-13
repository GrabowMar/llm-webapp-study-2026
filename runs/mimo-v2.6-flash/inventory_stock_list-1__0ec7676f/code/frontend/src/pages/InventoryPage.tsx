import { useEffect, useState } from "react";
import Link from "../router";
import { api, toApiError, type Item, type ItemsPage } from "../api";

interface Props {
  user: string | null;
}

const PAGE_SIZES = [10, 20, 50, 100];

export default function InventoryPage({ user }: Props) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [location, setLocation] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [data, setData] = useState<ItemsPage | null>(null);
  const [locations, setLocations] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, location, lowOnly, pageSize]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .listItems({
        q: debouncedQuery || undefined,
        location: location || undefined,
        low_stock: lowOnly,
        page,
        page_size: pageSize,
      })
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setError("");
      })
      .catch((err) => {
        if (!cancelled) setError(toApiError(err).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, location, lowOnly, page, pageSize, reload]);

  useEffect(() => {
    let cancelled = false;
    api
      .listItems({ page_size: 1000 })
      .then((result) => {
        if (cancelled) return;
        const found = new Set<string>();
        for (const item of result.items) {
          if (item.location) found.add(item.location);
        }
        setLocations(Array.from(found).sort((a, b) => a.localeCompare(b)));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const remove = async (item: Item) => {
    const confirmed = window.confirm(
      `Delete "${item.name}" (${item.sku})? Its stock movements will be deleted too.`,
    );
    if (!confirmed) return;
    try {
      await api.deleteItem(item.id);
      setReload((value) => value + 1);
    } catch (err) {
      setError(toApiError(err).message);
    }
  };

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  const hasFilters = Boolean(debouncedQuery || location || lowOnly);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Inventory</h1>
          <p className="text-sm text-slate-500">
            {loading ? "Loading…" : `${total} item${total === 1 ? "" : "s"}`}
          </p>
        </div>
        {user && (
          <Link
            to="/items/new"
            className="rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500"
          >
            Add item
          </Link>
        )}
      </div>

      {!user && (
        <p className="mt-3 rounded border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
          <Link to="/login" className="font-medium text-sky-700 hover:underline">
            Sign in
          </Link>{" "}
          to add items and record stock movements.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="min-w-48 flex-1">
          <label htmlFor="search" className="block text-sm font-medium">
            Search
          </label>
          <input
            id="search"
            type="search"
            placeholder="Name, SKU or location…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>

        <div>
          <label htmlFor="location" className="block text-sm font-medium">
            Location
          </label>
          <select
            id="location"
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            className="mt-1 rounded border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          >
            <option value="">All locations</option>
            {locations.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 pb-2">
          <button
            type="button"
            role="switch"
            aria-checked={lowOnly}
            aria-label="Low stock only"
            onClick={() => setLowOnly((value) => !value)}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${
              lowOnly ? "bg-amber-500" : "bg-slate-300"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
                lowOnly ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
          <label
            className="cursor-pointer text-sm font-medium select-none"
            onClick={() => setLowOnly((value) => !value)}
          >
            Low stock only
          </label>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">SKU</th>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3 text-right">Quantity</th>
              <th className="px-4 py-3 text-right">Reorder level</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.id}
                className={`border-b border-slate-100 last:border-0 ${
                  item.low_stock ? "bg-amber-100" : "bg-white hover:bg-slate-50"
                }`}
              >
                <td className="px-4 py-3">
                  <Link
                    to={`/items/${item.id}`}
                    className="font-medium text-sky-700 hover:underline"
                  >
                    {item.name}
                  </Link>
                </td>
                <td className="px-4 py-3 font-mono text-xs">{item.sku}</td>
                <td className="px-4 py-3">{item.location || "—"}</td>
                <td className="px-4 py-3 text-right font-semibold">{item.quantity}</td>
                <td className="px-4 py-3 text-right text-slate-600">
                  {item.reorder_level}
                </td>
                <td className="px-4 py-3">
                  {item.low_stock ? (
                    <span className="inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                      Low stock
                    </span>
                  ) : (
                    <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                      OK
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <Link to={`/items/${item.id}`} className="text-sky-700 hover:underline">
                    View
                  </Link>
                  {user && (
                    <>
                      <span className="mx-2 text-slate-300">|</span>
                      <Link
                        to={`/items/${item.id}/edit`}
                        className="text-sky-700 hover:underline"
                      >
                        Edit
                      </Link>
                      <span className="mx-2 text-slate-300">|</span>
                      <button
                        type="button"
                        onClick={() => remove(item)}
                        className="text-red-600 hover:underline"
                      >
                        Delete
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  {hasFilters ? "No items match your filters." : "No items yet."}
                </td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  Loading items…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <label htmlFor="page-size">Rows per page</label>
          <select
            id="page-size"
            value={pageSize}
            onChange={(event) => setPageSize(Number(event.target.value))}
            className="rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-sky-500 focus:outline-none"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3 text-sm">
          <button
            type="button"
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            disabled={page <= 1}
            className="rounded border border-slate-300 bg-white px-3 py-1.5 font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-slate-600">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
            disabled={page >= totalPages}
            className="rounded border border-slate-300 bg-white px-3 py-1.5 font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { useRouter } from "../router";
import type { Item } from "../types";
import AuthPanel from "../components/AuthPanel";
import ItemDialog from "../components/ItemDialog";

const PAGE_SIZES = [10, 25, 50, 100];

const inputClass =
  "rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";

export default function InventoryPage() {
  const { username } = useAuth();
  const { navigate } = useRouter();

  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [location, setLocation] = useState("");
  const [lowStock, setLowStock] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [locations, setLocations] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(query.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const loadLocations = useCallback(() => {
    api
      .listItems({ page_size: 1000 })
      .then((data) => {
        const unique = Array.from(
          new Set(data.items.map((item) => item.location).filter((value) => value.trim().length > 0)),
        );
        unique.sort((a, b) => a.localeCompare(b));
        setLocations(unique);
      })
      .catch(() => setLocations([]));
  }, []);

  useEffect(() => {
    loadLocations();
  }, [loadLocations]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .listItems({
        q: search,
        location,
        low_stock: lowStock,
        page,
        page_size: pageSize,
      })
      .then((data) => {
        if (cancelled) {
          return;
        }
        setItems(data.items);
        setTotal(data.total);
        setError(null);
      })
      .catch((requestError) => {
        if (!cancelled) {
          setError(requestError instanceof Error ? requestError.message : "Could not load items.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [search, location, lowStock, page, pageSize, reloadToken]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const requireSignIn = (message: string) => {
    setNotice(message);
    const panel = document.getElementById("auth-panel");
    panel?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const openAddDialog = () => {
    if (!username) {
      requireSignIn("Sign in to add items.");
      return;
    }
    setNotice(null);
    setAddOpen(true);
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Inventory</h1>
          <p className="text-sm text-slate-500">
            {total} {total === 1 ? "item" : "items"} tracked in the warehouse.
          </p>
        </div>
        <button
          type="button"
          onClick={openAddDialog}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500"
        >
          Add item
        </button>
      </div>

      {notice ? (
        <p role="status" className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {notice}
        </p>
      ) : null}

      {!username ? <AuthPanel /> : null}

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-4 border-b border-slate-200 p-4 md:grid-cols-4">
          <div>
            <label htmlFor="filter-search" className="mb-1 block text-sm font-medium text-slate-700">
              Search
            </label>
            <input
              id="filter-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name or SKU"
              className={`${inputClass} w-full`}
            />
          </div>

          <div>
            <label htmlFor="filter-location" className="mb-1 block text-sm font-medium text-slate-700">
              Location
            </label>
            <select
              id="filter-location"
              value={location}
              onChange={(event) => {
                setLocation(event.target.value);
                setPage(1);
              }}
              className={`${inputClass} w-full`}
            >
              <option value="">All locations</option>
              {locations.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <button
              type="button"
              role="switch"
              aria-checked={lowStock}
              onClick={() => {
                setLowStock((value) => !value);
                setPage(1);
              }}
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <span
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                  lowStock ? "bg-indigo-600" : "bg-slate-300"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                    lowStock ? "translate-x-4" : "translate-x-0.5"
                  }`}
                />
              </span>
              Low stock only
            </button>
          </div>

          <div className="flex items-end">
            <label htmlFor="filter-page-size" className="mb-1 block text-sm font-medium text-slate-700">
              Per page
            </label>
            <select
              id="filter-page-size"
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setPage(1);
              }}
              className={`${inputClass} w-full`}
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error ? (
          <p role="alert" className="border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Item
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  SKU
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Location
                </th>
                <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Quantity
                </th>
                <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Reorder level
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {items.map((item) => (
                <tr
                  key={item.id}
                  className={item.low_stock ? "bg-amber-50 hover:bg-amber-100" : "hover:bg-slate-50"}
                >
                  <td className="px-4 py-3 text-sm font-medium text-slate-900">
                    <a
                      href={`/items/${item.id}`}
                      onClick={(event) => {
                        event.preventDefault();
                        navigate(`/items/${item.id}`);
                      }}
                      className="text-indigo-700 hover:underline"
                    >
                      {item.name}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{item.sku}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{item.location || "-"}</td>
                  <td className="px-4 py-3 text-right text-sm tabular-nums text-slate-900">{item.quantity}</td>
                  <td className="px-4 py-3 text-right text-sm tabular-nums text-slate-600">{item.reorder_level}</td>
                  <td className="px-4 py-3 text-sm">
                    {item.low_stock ? (
                      <span className="inline-flex rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">
                        Low stock
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800">
                        In stock
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {!loading && items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">
                    No items match the current filters.
                  </td>
                </tr>
              ) : null}
              {loading && items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">
                    Loading items...
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3">
          <p className="text-sm text-slate-500">
            Showing {items.length} of {total} items
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              disabled={page <= 1}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-sm text-slate-600">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
              disabled={page >= totalPages}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </section>

      <ItemDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={() => {
          setPage(1);
          setReloadToken((value) => value + 1);
          loadLocations();
          setNotice(null);
        }}
      />
    </div>
  );
}

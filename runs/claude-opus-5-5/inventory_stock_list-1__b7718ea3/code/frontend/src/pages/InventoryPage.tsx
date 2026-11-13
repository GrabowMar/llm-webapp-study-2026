import { useEffect, useState } from "react";
import { api, ApiError, type ItemPage } from "../api";
import { useAuth } from "../auth";
import { Link, navigate } from "../router";
import { Alert, Button, Card, Input, LowStockBadge, Spinner, linkButton } from "../components/ui";

const PAGE_SIZE = 20;

interface Filters {
  q: string;
  location: string;
  lowStock: boolean;
  page: number;
}

function parse(search: string): Filters {
  const p = new URLSearchParams(search);
  const page = Number.parseInt(p.get("page") ?? "1", 10);
  return {
    q: p.get("q") ?? "",
    location: p.get("location") ?? "",
    lowStock: ["1", "true"].includes(p.get("low_stock") ?? ""),
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

function toSearch(f: Filters): string {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.location) p.set("location", f.location);
  if (f.lowStock) p.set("low_stock", "true");
  if (f.page > 1) p.set("page", String(f.page));
  const s = p.toString();
  return s ? `/?${s}` : "/";
}

export function InventoryPage({ search }: { search: string }) {
  const { username } = useAuth();
  const filters = parse(search);
  const [data, setData] = useState<ItemPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [locations, setLocations] = useState<string[]>([]);
  const [qInput, setQInput] = useState(filters.q);

  const update = (patch: Partial<Filters>, replace = true) => {
    navigate(toSearch({ ...filters, page: 1, ...patch }), replace);
  };

  useEffect(() => {
    setQInput(filters.q);
  }, [filters.q]);

  useEffect(() => {
    if (qInput === filters.q) return;
    const t = window.setTimeout(() => update({ q: qInput.trim() === "" ? "" : qInput }), 300);
    return () => window.clearTimeout(t);
  }, [qInput]);

  useEffect(() => {
    api
      .locations()
      .then((r) => setLocations(r.items))
      .catch(() => setLocations([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .listItems({
        q: filters.q.trim(),
        location: filters.location,
        low_stock: filters.lowStock,
        page: filters.page,
        page_size: PAGE_SIZE,
      })
      .then((r) => {
        if (!cancelled) setData(r);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "Failed to load items");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filters.q, filters.location, filters.lowStock, filters.page]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;
  const locationOptions =
    filters.location && !locations.includes(filters.location) ? [filters.location, ...locations] : locations;
  const hasFilters = !!(filters.q || filters.location || filters.lowStock);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Inventory</h1>
          <p className="text-sm text-slate-500">
            {data ? `${data.total} item${data.total === 1 ? "" : "s"}` : "\u00a0"}
          </p>
        </div>
        {username ? (
          <Link href="/items/new" className={linkButton.primary}>
            + Add item
          </Link>
        ) : (
          <p className="text-sm text-slate-500">
            <Link href="/login" className="font-medium text-indigo-600 hover:underline">
              Sign in
            </Link>{" "}
            to add items and record stock.
          </p>
        )}
      </div>

      <Card className="flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-48 flex-1">
          <label htmlFor="search" className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
            Search
          </label>
          <Input
            id="search"
            type="search"
            placeholder="Search by name or SKU"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
          />
        </div>
        <div className="w-48">
          <label htmlFor="location" className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
            Location
          </label>
          <select
            id="location"
            value={filters.location}
            onChange={(e) => update({ location: e.target.value })}
            className="block w-full rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-indigo-600 focus:outline-none"
          >
            <option value="">All locations</option>
            {locationOptions.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <label className="flex cursor-pointer select-none items-center gap-2 pb-2 text-sm font-medium text-slate-700">
          <button
            type="button"
            role="switch"
            aria-checked={filters.lowStock}
            aria-label="Low stock only"
            onClick={() => update({ lowStock: !filters.lowStock })}
            className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 ${
              filters.lowStock ? "bg-amber-500" : "bg-slate-300"
            }`}
          >
            <span
              className={`inline-block h-5 w-5 translate-y-0.5 rounded-full bg-white shadow transition-transform ${
                filters.lowStock ? "translate-x-5.5" : "translate-x-0.5"
              }`}
            />
          </button>
          <span>Low stock only</span>
        </label>
        {hasFilters && (
          <Button
            variant="ghost"
            onClick={() => {
              setQInput("");
              navigate("/", true);
            }}
          >
            Clear
          </Button>
        )}
      </Card>

      {error && <Alert>{error}</Alert>}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3 text-right">Quantity</th>
                <th className="px-4 py-3 text-right">Reorder level</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && !data ? (
                <tr>
                  <td colSpan={6}>
                    <Spinner />
                  </td>
                </tr>
              ) : data && data.items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                    {hasFilters ? "No items match your filters." : "No items yet."}
                  </td>
                </tr>
              ) : (
                data?.items.map((item) => (
                  <tr
                    key={item.id}
                    data-low-stock={item.low_stock || undefined}
                    onClick={() => navigate(`/items/${item.id}`)}
                    className={`cursor-pointer transition-colors ${
                      item.low_stock
                        ? "bg-amber-50 hover:bg-amber-100 [&>td:first-child]:border-l-4 [&>td:first-child]:border-amber-400"
                        : "hover:bg-slate-50 [&>td:first-child]:border-l-4 [&>td:first-child]:border-transparent"
                    } ${loading ? "opacity-60" : ""}`}
                  >
                    <td className="px-4 py-3 font-medium">
                      <Link
                        href={`/items/${item.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-slate-900 hover:text-indigo-600 hover:underline"
                      >
                        {item.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{item.sku}</td>
                    <td className="px-4 py-3 text-slate-600">{item.location || "—"}</td>
                    <td
                      className={`px-4 py-3 text-right tabular-nums font-semibold ${
                        item.low_stock ? "text-amber-700" : "text-slate-900"
                      }`}
                    >
                      {item.quantity}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-600">{item.reorder_level}</td>
                    <td className="px-4 py-3">{item.low_stock ? <LowStockBadge /> : <span className="text-xs text-emerald-700">OK</span>}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {data && data.total > 0 && (
          <nav
            aria-label="Pagination"
            className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3 text-sm"
          >
            <span className="text-slate-600">
              Showing {(data.page - 1) * data.page_size + (data.items.length ? 1 : 0)}–
              {(data.page - 1) * data.page_size + data.items.length} of {data.total} · Page {data.page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                disabled={filters.page <= 1}
                onClick={() => update({ page: filters.page - 1 }, false)}
              >
                ← Previous
              </Button>
              <Button
                variant="secondary"
                disabled={filters.page >= totalPages}
                onClick={() => update({ page: filters.page + 1 }, false)}
              >
                Next →
              </Button>
            </div>
          </nav>
        )}
      </Card>
    </div>
  );
}

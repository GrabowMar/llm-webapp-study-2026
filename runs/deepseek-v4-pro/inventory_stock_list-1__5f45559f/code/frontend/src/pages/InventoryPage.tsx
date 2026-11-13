import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { Item, ItemListResponse } from "../types";

export default function InventoryPage({ signedIn }: { signedIn: boolean }) {
  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [q, setQ] = useState("");
  const [location, setLocation] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [locations, setLocations] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    api<ItemListResponse>("/items?page_size=100").then((res) => {
      setLocations(
        Array.from(new Set(res.items.map((i) => i.location).filter(Boolean))).sort(),
      );
    }).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("page_size", String(pageSize));
    if (q) params.set("q", q);
    if (location) params.set("location", location);
    if (lowOnly) params.set("low_stock", "true");

    api<ItemListResponse>(`/items?${params.toString()}`)
      .then((res) => {
        if (cancelled) return;
        setItems(res.items);
        setTotal(res.total);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load items");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [page, pageSize, q, location, lowOnly]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Inventory</h1>
        {signedIn && (
          <Link
            to="/items/new"
            className="rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
          >
            Add item
          </Link>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          placeholder="Search name or SKU..."
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          className="rounded border border-gray-300 px-3 py-2"
        />
        <select
          value={location}
          onChange={(e) => {
            setLocation(e.target.value);
            setPage(1);
          }}
          className="rounded border border-gray-300 px-3 py-2"
        >
          <option value="">All locations</option>
          {locations.map((loc) => (
            <option key={loc} value={loc}>
              {loc}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={lowOnly}
            onChange={(e) => {
              setLowOnly(e.target.checked);
              setPage(1);
            }}
          />
          Low stock only
        </label>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">SKU</th>
                <th className="px-4 py-2 font-medium">Location</th>
                <th className="px-4 py-2 font-medium">Quantity</th>
                <th className="px-4 py-2 font-medium">Reorder level</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                    No items found
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr
                    key={item.id}
                    className={
                      "border-b border-gray-100 " +
                      (item.low_stock ? "bg-red-50" : "hover:bg-gray-50")
                    }
                  >
                    <td className="px-4 py-2">
                      <Link to={`/items/${item.id}`} className="text-blue-600 hover:underline">
                        {item.name}
                      </Link>
                      {item.low_stock && (
                        <span className="ml-2 rounded bg-red-200 px-1.5 py-0.5 text-xs font-medium text-red-800">
                          Low
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2">{item.sku}</td>
                    <td className="px-4 py-2">{item.location}</td>
                    <td className="px-4 py-2">{item.quantity}</td>
                    <td className="px-4 py-2">{item.reorder_level}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex items-center gap-3 text-sm">
        <button
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
          className="rounded border border-gray-300 px-3 py-1 disabled:opacity-50"
        >
          Previous
        </button>
        <span>
          Page {page} of {totalPages} ({total} items)
        </span>
        <button
          disabled={page >= totalPages}
          onClick={() => setPage(page + 1)}
          className="rounded border border-gray-300 px-3 py-1 disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}

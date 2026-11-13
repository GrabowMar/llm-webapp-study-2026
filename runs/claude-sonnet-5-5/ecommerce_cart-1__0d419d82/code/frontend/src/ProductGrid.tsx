import { useEffect, useState } from "react";
import { api, ApiError, money, type Page } from "./api";

export default function ProductGrid({
  reload,
  onAdd,
}: {
  reload: number;
  onAdd: (id: number) => void;
}) {
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(input.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [input]);

  useEffect(() => {
    let stale = false;
    const params = new URLSearchParams({ page: String(page), page_size: "8" });
    if (q) params.set("q", q);
    api<Page>("GET", `/products?${params}`)
      .then((d) => {
        if (!stale) {
          setData(d);
          setError("");
        }
      })
      .catch((e) => {
        if (!stale) setError(e instanceof ApiError ? e.message : "Failed to load");
      });
    return () => {
      stale = true;
    };
  }, [q, page, reload]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <section>
      <input
        type="search"
        placeholder="Search products"
        aria-label="Search products"
        className="mb-4 w-full max-w-sm rounded border border-slate-300 px-3 py-2 text-sm"
        value={input}
        onChange={(e) => setInput(e.target.value)}
      />
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {data && data.items.length === 0 && (
        <p className="text-slate-600">No products found.</p>
      )}
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {data?.items.map((p) => (
          <li
            key={p.id}
            data-testid="product"
            className="flex flex-col overflow-hidden rounded-lg border bg-white shadow-sm"
          >
            <div className="relative flex h-32 items-center justify-center bg-gradient-to-br from-slate-200 to-slate-300 text-4xl font-bold text-slate-400">
              {p.name.charAt(0).toUpperCase()}
              {p.stock <= 0 && (
                <span className="absolute right-2 top-2 rounded bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">
                  Out of stock
                </span>
              )}
            </div>
            <div className="flex flex-1 flex-col gap-1 p-3">
              <h3 className="font-semibold">{p.name}</h3>
              <p className="line-clamp-2 text-sm text-slate-600">{p.description}</p>
              <p className="mt-auto pt-2 font-medium">{money(p.price)}</p>
              <button
                className="mt-2 rounded bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                disabled={p.stock <= 0}
                onClick={() => onAdd(p.id)}
              >
                Add to cart
              </button>
            </div>
          </li>
        ))}
      </ul>
      <nav className="mt-6 flex items-center justify-center gap-3 text-sm">
        <button
          className="rounded border px-3 py-1 disabled:opacity-40"
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
        >
          Previous
        </button>
        <span>
          Page {page} of {pages}
        </span>
        <button
          className="rounded border px-3 py-1 disabled:opacity-40"
          disabled={page >= pages}
          onClick={() => setPage(page + 1)}
        >
          Next
        </button>
      </nav>
    </section>
  );
}

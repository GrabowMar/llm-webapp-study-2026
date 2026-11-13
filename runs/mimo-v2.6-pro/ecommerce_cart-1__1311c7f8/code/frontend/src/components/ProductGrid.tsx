import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { Product, ProductPage } from "../lib/api";
import { api, errorMessage, money } from "../lib/api";

const PAGE_SIZE = 8;

interface Props {
  signedIn: boolean;
  onRequireAuth: () => void;
  onCartUpdated: () => void;
}

export default function ProductGrid({ signedIn, onRequireAuth, onCartUpdated }: Props) {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ProductPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handle = setTimeout(() => {
      setQuery(input.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [input]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api<ProductPage>(
      `/products?q=${encodeURIComponent(query)}&page=${page}&page_size=${PAGE_SIZE}`,
    )
      .then((res) => {
        if (!cancelled) {
          setData(res);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query, page]);

  async function addToCart(product: Product) {
    if (!signedIn) {
      onRequireAuth();
      return;
    }
    try {
      await api("/cart", {
        method: "POST",
        body: { product_id: product.id, quantity: 1 },
      });
      setError(null);
      onCartUpdated();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setQuery(input.trim());
    setPage(1);
  }

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-semibold text-slate-900">Products</h2>
        <form onSubmit={submitSearch} className="relative w-full sm:w-72">
          <svg
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.45 4.39l3.17 3.17a.75.75 0 1 1-1.06 1.06l-3.17-3.17A7 7 0 0 1 2 9Z"
              clipRule="evenodd"
            />
          </svg>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Search products…"
            className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          />
        </form>
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
      )}

      {loading && !data ? (
        <p className="py-12 text-center text-slate-500">Loading products…</p>
      ) : items.length === 0 ? (
        <p className="py-12 text-center text-slate-500">
          No products found{query ? ` for “${query}”` : ""}.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {items.map((product) => (
            <article
              key={product.id}
              className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
            >
              <div
                className={`relative flex aspect-square items-center justify-center ${
                  product.id % 2
                    ? "bg-gradient-to-br from-indigo-100 to-slate-200"
                    : "bg-gradient-to-br from-amber-100 to-rose-100"
                }`}
              >
                <span className="select-none text-6xl font-bold text-white/80 drop-shadow">
                  {product.name.charAt(0).toUpperCase()}
                </span>
                {product.stock === 0 && (
                  <span className="absolute right-2 top-2 rounded-full bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white">
                    Out of stock
                  </span>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-1 p-3">
                <h3 className="text-sm font-semibold text-slate-900">{product.name}</h3>
                <p className="line-clamp-2 text-xs text-slate-500">{product.description}</p>
                <div className="mt-auto flex items-center justify-between pt-2">
                  <span className="text-sm font-bold text-slate-900">{money(product.price)}</span>
                  <button
                    onClick={() => addToCart(product)}
                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
                  >
                    Add to cart
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {total > 0 && (
        <div className="mt-6 flex items-center justify-between">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            Previous
          </button>
          <p className="text-sm text-slate-600">
            Page {data?.page ?? 1} of {totalPages} · {total} products
          </p>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </section>
  );
}

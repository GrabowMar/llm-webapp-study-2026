import { useEffect, useState } from "react";
import { errorMessage } from "../api";
import type { Product } from "../types";

type Props = {
  product: Product;
  isAdmin: boolean;
  onAdd: (product: Product) => void;
  onPatch: (id: number, body: Partial<Product>) => Promise<Product>;
};

function formatPrice(value: number): string {
  return `$${value.toFixed(2)}`;
}

function ProductCard({ product, isAdmin, onAdd, onPatch }: Props) {
  const [price, setPrice] = useState(product.price.toFixed(2));
  const [stock, setStock] = useState(String(product.stock));
  const [isActive, setIsActive] = useState(product.is_active);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPrice(product.price.toFixed(2));
    setStock(String(product.stock));
    setIsActive(product.is_active);
    setError("");
  }, [product]);

  const outOfStock = product.stock <= 0;

  async function save() {
    setError("");
    if (price.trim() === "") {
      setError("Price is required");
      return;
    }
    if (stock.trim() === "") {
      setError("Stock is required");
      return;
    }
    const priceValue = Number(price);
    const stockValue = Number(stock);
    if (!Number.isFinite(priceValue) || priceValue < 0) {
      setError("Price must be a non-negative number");
      return;
    }
    if (!Number.isInteger(stockValue) || stockValue < 0) {
      setError("Stock must be a non-negative integer");
      return;
    }
    setBusy(true);
    try {
      await onPatch(product.id, {
        price: priceValue,
        stock: stockValue,
        is_active: isActive,
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
      <div className="relative flex h-36 items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200">
        <span className="text-4xl font-black text-slate-300 select-none">
          {product.name.charAt(0).toUpperCase()}
        </span>
        {outOfStock && (
          <span className="absolute right-2 top-2 rounded-full bg-red-600 px-2.5 py-1 text-xs font-bold text-white shadow">
            Out of stock
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="font-semibold text-slate-900">{product.name}</h3>
        <p className="line-clamp-2 min-h-10 text-sm text-slate-500">{product.description}</p>
        <p className="text-lg font-bold text-slate-900">{formatPrice(product.price)}</p>

        <button
          type="button"
          disabled={outOfStock}
          onClick={() => onAdd(product)}
          className="mt-auto rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {outOfStock ? "Out of stock" : "Add to cart"}
        </button>

        {isAdmin && (
          <div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
              Quick edit
            </p>
            <div className="flex items-center gap-2">
              <label className="flex-1 text-xs text-slate-500">
                Price
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-indigo-500"
                />
              </label>
              <label className="flex-1 text-xs text-slate-500">
                Stock
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={stock}
                  onChange={(event) => setStock(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-indigo-500"
                />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(event) => setIsActive(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 accent-indigo-600"
              />
              Active
            </label>
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="w-full rounded-lg bg-slate-900 py-1.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60"
            >
              {busy ? "Saving…" : "Save"}
            </button>
            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>
        )}
      </div>
    </article>
  );
}

type GridProps = {
  products: Product[];
  isAdmin: boolean;
  onAdd: (product: Product) => void;
  onPatch: (id: number, body: Partial<Product>) => Promise<Product>;
};

export default function ProductGrid({
  products,
  isAdmin,
  onAdd,
  onPatch,
}: GridProps) {
  if (products.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
        No products found.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          isAdmin={isAdmin}
          onAdd={onAdd}
          onPatch={onPatch}
        />
      ))}
    </div>
  );
}

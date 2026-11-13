import type { Product } from "../types";

const TILE_COLORS = [
  "from-rose-100 to-rose-200 text-rose-500",
  "from-amber-100 to-amber-200 text-amber-600",
  "from-emerald-100 to-emerald-200 text-emerald-600",
  "from-sky-100 to-sky-200 text-sky-600",
  "from-violet-100 to-violet-200 text-violet-600",
  "from-teal-100 to-teal-200 text-teal-600",
];

export function money(value: number): string {
  return `$${value.toFixed(2)}`;
}

function tileStyle(product: Product): string {
  const sum = product.id + product.name.charCodeAt(0);
  return TILE_COLORS[sum % TILE_COLORS.length];
}

export default function ProductCard({
  product,
  canBuy,
  onAdd,
}: {
  product: Product;
  canBuy: boolean;
  onAdd: (product: Product) => void;
}) {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
      <div
        className={`relative flex h-36 items-center justify-center bg-gradient-to-br ${tileStyle(product)}`}
      >
        <span className="select-none text-5xl font-bold opacity-40">
          {product.name.charAt(0).toUpperCase()}
        </span>
        {product.stock <= 0 && (
          <span className="absolute left-2 top-2 rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white shadow">
            Out of stock
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-slate-900">{product.name}</h3>
          <span className="whitespace-nowrap rounded-md bg-indigo-50 px-2 py-1 text-sm font-semibold text-indigo-700">
            {money(product.price)}
          </span>
        </div>
        <p className="line-clamp-2 flex-1 text-sm text-slate-500">{product.description}</p>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-slate-400">{product.stock} in stock</span>
          <button
            type="button"
            disabled={!canBuy || product.stock <= 0}
            onClick={() => onAdd(product)}
            title={canBuy ? undefined : "Sign in to add items to your cart"}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Add to cart
          </button>
        </div>
      </div>
    </div>
  );
}

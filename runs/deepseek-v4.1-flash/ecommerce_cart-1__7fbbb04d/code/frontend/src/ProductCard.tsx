import { money, type Product } from "./types";

interface Props {
  product: Product;
  onAdd: (product: Product) => void;
  adding: boolean;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

export default function ProductCard({ product, onAdd, adding }: Props) {
  const outOfStock = product.stock <= 0;

  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
      <div className="relative flex h-36 items-center justify-center bg-gradient-to-br from-slate-100 via-teal-50 to-slate-200">
        <span className="text-3xl font-semibold tracking-tight text-slate-400">
          {initials(product.name)}
        </span>
        {outOfStock && (
          <span className="absolute right-2 top-2 rounded-full bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white">
            Out of stock
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-900">{product.name}</h3>
          <span className="whitespace-nowrap text-sm font-semibold text-teal-700">
            {money(product.price)}
          </span>
        </div>
        <p className="line-clamp-2 flex-1 text-xs leading-relaxed text-slate-500">
          {product.description}
        </p>
        <button
          type="button"
          onClick={() => onAdd(product)}
          disabled={outOfStock || adding}
          className="mt-1 w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
        >
          {outOfStock ? "Unavailable" : adding ? "Adding…" : "Add to cart"}
        </button>
      </div>
    </article>
  );
}

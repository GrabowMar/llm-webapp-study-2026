import type { Cart, CartItem } from "../types";

type Props = {
  open: boolean;
  cart: Cart | null;
  error: string;
  busy: boolean;
  onClose: () => void;
  onQuantity: (item: CartItem, quantity: number) => void;
  onRemove: (item: CartItem) => void;
};

function formatPrice(value: number): string {
  return `$${value.toFixed(2)}`;
}

export default function CartDrawer({
  open,
  cart,
  error,
  busy,
  onClose,
  onQuantity,
  onRemove,
}: Props) {
  if (!open) {
    return null;
  }

  const items = cart?.items ?? [];

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/40" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-bold text-slate-900">Your cart</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close cart"
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && (
            <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {error}
            </p>
          )}

          {items.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">
              Your cart is empty.
            </p>
          ) : (
            <ul className="space-y-4">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="rounded-xl border border-slate-200 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-900">{item.name}</p>
                      <p className="text-sm text-slate-500">
                        {formatPrice(item.unit_price)} each
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemove(item)}
                      disabled={busy}
                      aria-label={`Remove ${item.name}`}
                      className="rounded-lg px-2 py-1 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onQuantity(item, item.quantity - 1)}
                        disabled={busy || item.quantity <= 1}
                        aria-label="Decrease quantity"
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                      >
                        −
                      </button>
                      <span className="min-w-8 text-center text-sm font-semibold text-slate-900">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => onQuantity(item, item.quantity + 1)}
                        disabled={busy}
                        aria-label="Increase quantity"
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                      >
                        +
                      </button>
                    </div>
                    <span className="font-bold text-slate-900">
                      {formatPrice(item.line_total)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-slate-200 px-5 py-4">
          <div className="flex items-center justify-between text-slate-600">
            <span className="text-sm font-medium">Subtotal</span>
            <span className="text-xl font-bold text-slate-900">
              {formatPrice(cart?.subtotal ?? 0)}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Totals are calculated from current prices.
          </p>
        </div>
      </aside>
    </div>
  );
}

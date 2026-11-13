import type { Cart } from "../types";
import { money } from "./ProductCard";

export default function CartPanel({
  cart,
  error,
  busy,
  onSetQuantity,
  onRemove,
  onClose,
}: {
  cart: Cart;
  error: string | null;
  busy: boolean;
  onSetQuantity: (itemId: number, quantity: number) => void;
  onRemove: (itemId: number) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} aria-hidden />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Your cart</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close cart"
          >
            ✕
          </button>
        </header>

        {error && (
          <p className="mx-5 mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {cart.items.length === 0 ? (
            <p className="mt-10 text-center text-sm text-slate-500">
              Your cart is empty. Add something nice!
            </p>
          ) : (
            cart.items.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-slate-200 bg-slate-50/60 p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-medium text-slate-900">{item.name}</h3>
                    <p className="text-sm text-slate-500">{money(item.unit_price)} each</p>
                  </div>
                  <span className="font-semibold text-slate-900">{money(item.line_total)}</span>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <div
                    className={`flex items-center overflow-hidden rounded-lg border border-slate-300 bg-white ${
                      busy ? "pointer-events-none opacity-60" : ""
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onSetQuantity(item.id, item.quantity - 1)}
                      disabled={item.quantity <= 1}
                      className="px-3 py-1.5 text-lg leading-none text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                      aria-label={`Decrease ${item.name} quantity`}
                    >
                      −
                    </button>
                    <span className="min-w-10 text-center text-sm font-semibold tabular-nums">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => onSetQuantity(item.id, item.quantity + 1)}
                      className="px-3 py-1.5 text-lg leading-none text-slate-600 hover:bg-slate-100"
                      aria-label={`Increase ${item.name} quantity`}
                    >
                      +
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemove(item.id)}
                    disabled={busy}
                    className="text-sm font-medium text-red-600 hover:text-red-700 hover:underline disabled:opacity-40"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <footer className="border-t border-slate-200 px-5 py-4">
          <div className="flex items-center justify-between text-lg font-semibold text-slate-900">
            <span>Subtotal</span>
            <span className="tabular-nums">{money(cart.subtotal)}</span>
          </div>
          <p className="mt-1 text-xs text-slate-400">Prices are taken from the catalogue at any time.</p>
        </footer>
      </aside>
    </div>
  );
}

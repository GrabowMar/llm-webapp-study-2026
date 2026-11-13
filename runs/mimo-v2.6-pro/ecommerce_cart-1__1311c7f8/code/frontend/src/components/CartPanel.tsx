import { useState } from "react";
import type { Cart, CartItem } from "../lib/api";
import { api, errorMessage, money } from "../lib/api";

interface Props {
  open: boolean;
  cart: Cart | null;
  onClose: () => void;
  onChanged: () => void;
}

export default function CartPanel({ open, cart, onClose, onChanged }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function change(path: string, method: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      await api(path, { method, body });
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const setQuantity = (item: CartItem, quantity: number) =>
    change(`/cart/${item.id}`, "PATCH", { quantity });

  const removeItem = (item: CartItem) => change(`/cart/${item.id}`, "DELETE");

  const items = cart?.items ?? [];

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/40"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={`fixed inset-y-0 right-0 z-40 flex w-full max-w-md transform flex-col bg-white shadow-2xl transition-transform duration-200 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        aria-label="Shopping cart"
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Your cart</h2>
          <button
            onClick={onClose}
            aria-label="Close cart"
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </header>

        {error && (
          <p className="mx-5 mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {items.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-500">
              Your cart is empty. Add some products to get started.
            </p>
          ) : (
            <ul className="space-y-4">
              {items.map((item) => (
                <li key={item.id} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{item.name}</p>
                      <p className="text-xs text-slate-500">{money(item.unit_price)} each</p>
                    </div>
                    <p className="text-sm font-semibold text-slate-900">
                      {money(item.line_total)}
                    </p>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setQuantity(item, item.quantity - 1)}
                        disabled={busy || item.quantity <= 1}
                        aria-label={`Decrease quantity of ${item.name}`}
                        className="h-8 w-8 rounded-lg border border-slate-300 text-lg leading-none text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                      >
                        −
                      </button>
                      <span className="w-8 text-center text-sm font-semibold text-slate-900">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => setQuantity(item, item.quantity + 1)}
                        disabled={busy}
                        aria-label={`Increase quantity of ${item.name}`}
                        className="h-8 w-8 rounded-lg border border-slate-300 text-lg leading-none text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                      >
                        +
                      </button>
                    </div>
                    <button
                      onClick={() => removeItem(item)}
                      disabled={busy}
                      className="text-xs font-medium text-rose-600 hover:underline disabled:opacity-40"
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="border-t border-slate-200 px-5 py-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">Subtotal</span>
            <span className="text-lg font-bold text-slate-900">
              {money(cart?.subtotal ?? 0)}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Totals are computed by the server from current catalogue prices.
          </p>
        </footer>
      </aside>
    </>
  );
}

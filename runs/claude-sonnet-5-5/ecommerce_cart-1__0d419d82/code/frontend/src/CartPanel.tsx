import { useState } from "react";
import { api, ApiError, money, type Cart } from "./api";

export default function CartPanel({
  cart,
  onClose,
  onChanged,
}: {
  cart: Cart;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong");
    }
    await onChanged();
    setBusy(false);
  };

  const setQty = (id: number, quantity: number) =>
    run(() => api("PATCH", `/cart/${id}`, { quantity }));
  const remove = (id: number) => run(() => api("DELETE", `/cart/${id}`));

  return (
    <aside
      aria-label="Cart panel"
      className="fixed inset-y-0 right-0 z-20 flex w-full max-w-md flex-col border-l bg-white shadow-xl"
    >
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-lg font-semibold">Your cart</h2>
        <button className="rounded px-2 py-1 hover:bg-slate-100" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-2">
        {error && (
          <p role="alert" className="my-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        {cart.items.length === 0 && <p className="py-4 text-slate-600">Your cart is empty.</p>}
        <ul className="divide-y">
          {cart.items.map((i) => (
            <li key={i.id} data-testid="cart-item" className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{i.name}</p>
                <p className="text-sm text-slate-600">{money(i.unit_price)} each</p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  aria-label={`Decrease quantity of ${i.name}`}
                  className="h-7 w-7 rounded border disabled:opacity-40"
                  disabled={busy || i.quantity <= 1}
                  onClick={() => setQty(i.id, i.quantity - 1)}
                >
                  -
                </button>
                <span className="w-8 text-center" data-testid="quantity">{i.quantity}</span>
                <button
                  aria-label={`Increase quantity of ${i.name}`}
                  className="h-7 w-7 rounded border disabled:opacity-40"
                  disabled={busy}
                  onClick={() => setQty(i.id, i.quantity + 1)}
                >
                  +
                </button>
              </div>
              <p className="w-20 text-right font-medium">{money(i.line_total)}</p>
              <button
                aria-label={`Remove ${i.name}`}
                className="rounded px-2 py-1 text-sm text-red-700 hover:bg-red-50"
                disabled={busy}
                onClick={() => remove(i.id)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex items-center justify-between border-t px-4 py-3 text-lg font-semibold">
        <span>Subtotal</span>
        <span data-testid="subtotal">{money(cart.subtotal)}</span>
      </div>
    </aside>
  );
}

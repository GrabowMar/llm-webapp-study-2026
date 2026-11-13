import { useState } from "react";
import { formatPrice, type Cart } from "./api";

type Props = {
  cart: Cart;
  error: string | null;
  busy: boolean;
  onSetQuantity: (itemId: number, quantity: number) => void;
  onRemove: (itemId: number) => void;
  onClose: () => void;
};

export default function CartPanel({ cart, error, busy, onSetQuantity, onRemove, onClose }: Props) {
  return (
    <aside
      aria-label="Cart"
      className="fixed inset-y-0 right-0 z-30 flex w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl"
    >
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <h2 className="text-lg font-semibold text-slate-900">Your cart</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close cart"
          className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
        >
          ✕
        </button>
      </div>
      {error && (
        <p role="alert" className="mx-5 mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {cart.items.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-500">Your cart is empty.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {cart.items.map((item) => (
              <CartRow key={item.id} item={item} busy={busy} onSetQuantity={onSetQuantity} onRemove={onRemove} />
            ))}
          </ul>
        )}
      </div>
      <div className="border-t border-slate-200 px-5 py-4">
        <div className="flex items-center justify-between text-base font-semibold text-slate-900">
          <span>Subtotal</span>
          <span data-testid="cart-subtotal">{formatPrice(cart.subtotal)}</span>
        </div>
        <p className="mt-1 text-xs text-slate-500">Totals use current catalogue prices.</p>
      </div>
    </aside>
  );
}

function CartRow({
  item,
  busy,
  onSetQuantity,
  onRemove,
}: {
  item: Cart["items"][number];
  busy: boolean;
  onSetQuantity: (itemId: number, quantity: number) => void;
  onRemove: (itemId: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  function commit() {
    if (draft === null) return;
    const n = Number(draft);
    setDraft(null);
    if (Number.isInteger(n) && n !== item.quantity) onSetQuantity(item.id, n);
  }

  return (
    <li className="flex gap-3 py-4">
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-100 to-slate-200 text-lg font-bold text-indigo-400">
        {item.name.charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate font-medium text-slate-900">{item.name}</p>
          <p className="shrink-0 font-semibold text-slate-900">{formatPrice(item.line_total)}</p>
        </div>
        <p className="text-xs text-slate-500">{formatPrice(item.unit_price)} each</p>
        <div className="mt-2 flex items-center justify-between">
          <div className="inline-flex items-center rounded-md border border-slate-300">
            <button
              type="button"
              aria-label={`Decrease quantity of ${item.name}`}
              disabled={busy || item.quantity <= 1}
              onClick={() => onSetQuantity(item.id, item.quantity - 1)}
              className="px-2.5 py-1 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
            >
              −
            </button>
            <input
              aria-label={`Quantity of ${item.name}`}
              inputMode="numeric"
              value={draft ?? String(item.quantity)}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
              }}
              className="w-12 border-x border-slate-300 py-1 text-center text-sm focus:outline-none"
            />
            <button
              type="button"
              aria-label={`Increase quantity of ${item.name}`}
              disabled={busy}
              onClick={() => onSetQuantity(item.id, item.quantity + 1)}
              className="px-2.5 py-1 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
            >
              +
            </button>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => onRemove(item.id)}
            className="text-sm font-medium text-red-600 hover:text-red-500 disabled:opacity-40"
          >
            Remove
          </button>
        </div>
      </div>
    </li>
  );
}

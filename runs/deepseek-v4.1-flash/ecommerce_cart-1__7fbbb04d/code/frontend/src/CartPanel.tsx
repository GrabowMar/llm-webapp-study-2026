import { money, type Cart } from "./types";

interface Props {
  cart: Cart | null;
  open: boolean;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onChangeQuantity: (itemId: number, quantity: number) => void;
  onRemove: (itemId: number) => void;
}

export default function CartPanel({
  cart,
  open,
  busy,
  error,
  onClose,
  onChangeQuantity,
  onRemove,
}: Props) {
  if (!open) {
    return null;
  }

  const items = cart?.items ?? [];

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-slate-900/30" onClick={onClose} />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Your cart</h2>
            <p className="text-xs text-slate-500">
              {items.length} item{items.length === 1 ? "" : "s"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-50"
          >
            Close
          </button>
        </header>

        {error && (
          <p role="alert" className="mx-5 mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {items.length === 0 ? (
            <p className="mt-10 text-center text-sm text-slate-500">Your cart is empty.</p>
          ) : (
            <ul className="space-y-4">
              {items.map((item) => (
                <li key={item.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{item.name}</p>
                      <p className="text-xs text-slate-500">{money(item.unit_price)} each</p>
                    </div>
                    <p className="text-sm font-semibold text-slate-900">{money(item.line_total)}</p>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center rounded-lg border border-slate-300">
                      <button
                        type="button"
                        aria-label="Decrease quantity"
                        disabled={busy || item.quantity <= 1}
                        onClick={() => onChangeQuantity(item.id, item.quantity - 1)}
                        className="px-3 py-1.5 text-lg leading-none text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        −
                      </button>
                      <span className="min-w-10 border-x border-slate-300 px-3 py-1.5 text-center text-sm font-medium text-slate-900">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        aria-label="Increase quantity"
                        disabled={busy}
                        onClick={() => onChangeQuantity(item.id, item.quantity + 1)}
                        className="px-3 py-1.5 text-lg leading-none text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        +
                      </button>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onRemove(item.id)}
                      className="text-sm font-medium text-rose-600 transition hover:text-rose-700 disabled:opacity-50"
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
            <span className="text-sm font-medium text-slate-600">Subtotal</span>
            <span className="text-xl font-semibold text-slate-900">
              {money(cart?.subtotal ?? 0)}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Prices reflect the current catalogue at all times.
          </p>
        </footer>
      </aside>
    </div>
  );
}

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  ApiError,
  createMovement,
  deleteItem,
  getItem,
  listMovements,
} from "./api";
import type { Item, Movement } from "./api";
import { inputCls, navigate } from "./App";

function formatTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export default function ItemPage({ id }: { id: number }) {
  const [item, setItem] = useState<Item | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [error, setError] = useState("");
  const [moveError, setMoveError] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [it, mv] = await Promise.all([getItem(id), listMovements(id)]);
      setItem(it);
      setMovements(mv.items);
      setError("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load the item.");
    }
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const record = async (kind: "receive" | "take") => {
    const n = Number(amount);
    if (!amount.trim() || !Number.isFinite(n) || n <= 0) {
      setMoveError("Enter a positive quantity.");
      return;
    }
    setBusy(true);
    setMoveError("");
    try {
      await createMovement(id, kind === "receive" ? Math.trunc(n) : -Math.trunc(n), reason.trim());
      setAmount("");
      setReason("");
      await refresh();
    } catch (err) {
      setMoveError(err instanceof ApiError ? err.message : "Could not record the movement.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!item) return;
    if (!window.confirm(`Delete "${item.name}" (${item.sku})? Its movements will be removed too.`)) {
      return;
    }
    try {
      await deleteItem(id);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete the item.");
    }
  };

  if (error && !item) {
    return (
      <div className="space-y-4">
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
        <button
          onClick={() => navigate("/")}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          ← Back to inventory
        </button>
      </div>
    );
  }

  if (!item) {
    return <p className="py-10 text-center text-slate-400">Loading…</p>;
  }

  const submit = (kind: "receive" | "take") => (e: FormEvent) => {
    e.preventDefault();
    record(kind);
  };

  const movementForm = (kind: "receive" | "take") => (
    <form
      onSubmit={submit(kind)}
      className={`rounded-lg border p-4 shadow-sm ${
        kind === "receive" ? "border-emerald-200 bg-emerald-50/50" : "border-rose-200 bg-rose-50/50"
      }`}
    >
      <h3 className={`mb-3 text-sm font-semibold ${kind === "receive" ? "text-emerald-800" : "text-rose-800"}`}>
        {kind === "receive" ? "Receive stock" : "Take out stock"}
      </h3>
      <div className="flex flex-wrap gap-2">
        <input
          type="number"
          min="1"
          step="1"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Quantity"
          className={`${inputCls} w-28`}
          aria-label={`${kind === "receive" ? "Received" : "Taken out"} quantity`}
        />
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (optional)"
          className={`${inputCls} min-w-32 flex-1`}
          aria-label="Movement reason"
        />
        <button
          type="submit"
          disabled={busy}
          className={`rounded-md px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-60 ${
            kind === "receive"
              ? "bg-emerald-600 hover:bg-emerald-500"
              : "bg-rose-600 hover:bg-rose-500"
          }`}
        >
          {kind === "receive" ? "Receive" : "Take out"}
        </button>
      </div>
    </form>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate("/")}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          ← Back to inventory
        </button>
        <div className="flex gap-2">
          <button
            onClick={() => navigate(`/items/${item.id}/edit`)}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
          >
            Edit
          </button>
          <button
            onClick={remove}
            className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      </div>

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{item.name}</h1>
            <p className="mt-1 text-sm text-slate-500">
              SKU <span className="font-mono text-slate-700">{item.sku}</span>
              {" · "}
              {item.location ? item.location : "No location"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold tabular-nums text-slate-900">{item.quantity}</p>
            <p className="text-xs uppercase tracking-wide text-slate-400">in stock</p>
          </div>
        </div>
        <div className="mt-3">
          {item.low_stock ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-300">
              ⚠ Low stock — at or below reorder level ({item.reorder_level})
            </span>
          ) : (
            <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
              OK — above reorder level ({item.reorder_level})
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {movementForm("receive")}
        {movementForm("take")}
      </div>
      {moveError && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {moveError}
        </p>
      )}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <h2 className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
          Stock movements
        </h2>
        {movements.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-400">No movements yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {movements.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="flex items-center gap-3">
                  <span
                    className={`inline-flex w-16 justify-center rounded-md px-2 py-1 text-xs font-bold tabular-nums ${
                      m.delta > 0
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-rose-100 text-rose-700"
                    }`}
                  >
                    {m.delta > 0 ? `+${m.delta}` : m.delta}
                  </span>
                  <div>
                    <p className="text-slate-800">
                      {m.reason || (m.delta > 0 ? "Stock received" : "Stock taken out")}
                    </p>
                    <p className="text-xs text-slate-400">
                      {m.username} · {formatTime(m.created_at)}
                    </p>
                  </div>
                </div>
                <p className="text-right text-xs text-slate-500">
                  Balance
                  <span className="ml-1 block text-sm font-semibold tabular-nums text-slate-800">
                    {m.quantity_after}
                  </span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

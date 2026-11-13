import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ApiError,
  createMovement,
  deleteItem,
  getItem,
  listMovements,
  type Item,
  type Movement,
} from "../api";
import { useAuth } from "../auth";
import { Alert, Badge, Field, inputClass } from "../components/ui";

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function ItemDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { username } = useAuth();

  const [item, setItem] = useState<Item | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [movementError, setMovementError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [receiveAmount, setReceiveAmount] = useState("");
  const [receiveReason, setReceiveReason] = useState("");
  const [takeAmount, setTakeAmount] = useState("");
  const [takeReason, setTakeReason] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    const [itemResult, movementResult] = await Promise.all([
      getItem(id),
      listMovements(id),
    ]);
    setItem(itemResult);
    setMovements(movementResult.items);
  }, [id]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    load()
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load item.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [load]);

  const recordMovement = async (
    event: FormEvent,
    delta: number,
    reason: string,
    reset: () => void,
  ) => {
    event.preventDefault();
    if (!id) return;
    setMovementError(null);
    if (!Number.isInteger(delta) || delta === 0) {
      setMovementError("Enter a non-zero whole number.");
      return;
    }
    setBusy(true);
    try {
      await createMovement(id, delta, reason);
      reset();
      await load();
    } catch (err) {
      setMovementError(
        err instanceof ApiError ? err.message : "Failed to record movement.",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleReceive = (event: FormEvent) => {
    const amount = Number(receiveAmount);
    return recordMovement(event, amount, receiveReason, () => {
      setReceiveAmount("");
      setReceiveReason("");
    });
  };

  const handleTakeOut = (event: FormEvent) => {
    const amount = Number(takeAmount);
    return recordMovement(event, -amount, takeReason, () => {
      setTakeAmount("");
      setTakeReason("");
    });
  };

  const handleDelete = async () => {
    if (!id || !item) return;
    if (!window.confirm(`Delete "${item.name}" and all of its movements?`)) {
      return;
    }
    setDeleteError(null);
    setBusy(true);
    try {
      await deleteItem(id);
      navigate("/");
    } catch (err) {
      setDeleteError(
        err instanceof ApiError ? err.message : "Failed to delete item.",
      );
      setBusy(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-500">Loading item…</p>;
  }

  if (error || !item) {
    return (
      <div className="space-y-4">
        <Alert>{error ?? "Item not found."}</Alert>
        <Link to="/" className="text-sm font-medium text-slate-900 hover:underline">
          ← Back to inventory
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/"
          className="text-sm font-medium text-slate-500 hover:text-slate-900"
        >
          ← Back to inventory
        </Link>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">
                {item.name}
              </h1>
              <Badge tone={item.low_stock ? "low" : "ok"}>
                {item.low_stock ? "Low stock" : "In stock"}
              </Badge>
            </div>
            <p className="mt-1 font-mono text-sm text-slate-500">{item.sku}</p>
          </div>
          {username && (
            <div className="flex items-center gap-2">
              <Link
                to={`/items/${item.id}/edit`}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Edit
              </Link>
              <button
                type="button"
                onClick={handleDelete}
                disabled={busy}
                className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
              >
                Delete
              </button>
            </div>
          )}
        </div>
        {deleteError && <div className="mt-3"><Alert>{deleteError}</Alert></div>}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Quantity
          </p>
          <p
            className={`mt-1 text-3xl font-semibold ${
              item.low_stock ? "text-red-600" : "text-slate-900"
            }`}
          >
            {item.quantity}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Reorder level
          </p>
          <p className="mt-1 text-3xl font-semibold text-slate-900">
            {item.reorder_level}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Location
          </p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {item.location || "—"}
          </p>
        </div>
      </div>

      {username && (
        <div className="grid gap-4 lg:grid-cols-2">
          <form
            onSubmit={handleReceive}
            className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Receive stock</h2>
              <span className="text-xs font-medium text-emerald-600">
                + quantity
              </span>
            </div>
            <Field label="Amount received" htmlFor="receive-amount">
              <input
                id="receive-amount"
                type="number"
                min={1}
                step={1}
                className={inputClass}
                value={receiveAmount}
                onChange={(event) => setReceiveAmount(event.target.value)}
                required
              />
            </Field>
            <Field label="Reason (optional)" htmlFor="receive-reason">
              <input
                id="receive-reason"
                className={inputClass}
                value={receiveReason}
                onChange={(event) => setReceiveReason(event.target.value)}
                placeholder="e.g. Delivery from supplier"
              />
            </Field>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
            >
              Receive
            </button>
          </form>

          <form
            onSubmit={handleTakeOut}
            className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Take out stock</h2>
              <span className="text-xs font-medium text-red-600">
                − quantity
              </span>
            </div>
            <Field label="Amount taken out" htmlFor="take-amount">
              <input
                id="take-amount"
                type="number"
                min={1}
                step={1}
                className={inputClass}
                value={takeAmount}
                onChange={(event) => setTakeAmount(event.target.value)}
                required
              />
            </Field>
            <Field label="Reason (optional)" htmlFor="take-reason">
              <input
                id="take-reason"
                className={inputClass}
                value={takeReason}
                onChange={(event) => setTakeReason(event.target.value)}
                placeholder="e.g. Order picked for customer"
              />
            </Field>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-60"
            >
              Take out
            </button>
          </form>
        </div>
      )}

      {movementError && <Alert>{movementError}</Alert>}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold">Movement history</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Newest movements first.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">When</th>
                <th className="px-5 py-3">By</th>
                <th className="px-5 py-3">Reason</th>
                <th className="px-5 py-3 text-right">Change</th>
                <th className="px-5 py-3 text-right">Quantity after</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {movements.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-slate-500">
                    No movements recorded yet.
                  </td>
                </tr>
              )}
              {movements.map((movement) => (
                <tr key={movement.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-5 py-3 text-slate-600">
                    {formatDate(movement.created_at)}
                  </td>
                  <td className="px-5 py-3 text-slate-700">
                    {movement.username}
                  </td>
                  <td className="px-5 py-3 text-slate-600">
                    {movement.reason || "—"}
                  </td>
                  <td
                    className={`px-5 py-3 text-right font-semibold ${
                      movement.delta > 0 ? "text-emerald-600" : "text-red-600"
                    }`}
                  >
                    {movement.delta > 0 ? `+${movement.delta}` : movement.delta}
                  </td>
                  <td className="px-5 py-3 text-right font-semibold text-slate-900">
                    {movement.quantity_after}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

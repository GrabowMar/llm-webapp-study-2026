import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ApiError, api } from "../api";
import { useAuth } from "../auth";
import { useRouter } from "../router";
import type { Item, Movement } from "../types";
import AuthPanel from "../components/AuthPanel";
import ConfirmDialog from "../components/ConfirmDialog";

const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";

function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

function MovementForm({
  mode,
  itemId,
  onRecorded,
}: {
  mode: "receive" | "take";
  itemId: number;
  onRecorded: () => void;
}) {
  const { username } = useAuth();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isReceive = mode === "receive";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!username) {
      setError("Sign in to record stock movements.");
      return;
    }

    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    const units = Math.round(parsed);
    const delta = isReceive ? units : -units;

    setBusy(true);
    try {
      await api.createMovement(itemId, { delta, reason: reason.trim() });
      setAmount("");
      setReason("");
      onRecorded();
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "Could not record the movement.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3" aria-label={isReceive ? "Receive" : "Take out"}>
      <h3 className="text-sm font-semibold text-slate-900">{isReceive ? "Receive" : "Take out"}</h3>
      <div>
        <label htmlFor={`${mode}-amount`} className="mb-1 block text-sm font-medium text-slate-700">
          Amount
        </label>
        <input
          id={`${mode}-amount`}
          name="amount"
          type="number"
          min={1}
          step={1}
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor={`${mode}-reason`} className="mb-1 block text-sm font-medium text-slate-700">
          Reason
        </label>
        <input
          id={`${mode}-reason`}
          name="reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Optional"
          className={inputClass}
        />
      </div>
      {error ? (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={busy}
        className={`w-full rounded-md px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-60 ${
          isReceive ? "bg-emerald-600 hover:bg-emerald-500" : "bg-amber-600 hover:bg-amber-500"
        }`}
      >
        {busy ? "Saving..." : isReceive ? "Receive stock" : "Take out stock"}
      </button>
    </form>
  );
}

function EditItemForm({ item, onSaved }: { item: Item; onSaved: (item: Item) => void }) {
  const [name, setName] = useState(item.name);
  const [sku, setSku] = useState(item.sku);
  const [location, setLocation] = useState(item.location);
  const [reorderLevel, setReorderLevel] = useState(String(item.reorder_level));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(item.name);
    setSku(item.sku);
    setLocation(item.location);
    setReorderLevel(String(item.reorder_level));
  }, [item.id, item.name, item.sku, item.location, item.reorder_level]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setErrors({});
    setBanner(null);
    setSaved(false);

    const nextErrors: Record<string, string> = {};
    if (!name.trim()) nextErrors.name = "Name is required.";
    if (!sku.trim()) nextErrors.sku = "SKU is required.";
    const reorder = Number(reorderLevel);
    if (!Number.isFinite(reorder) || reorder < 0) {
      nextErrors.reorder_level = "Reorder level must be 0 or more.";
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setBusy(true);
    try {
      const updated = await api.updateItem(item.id, {
        name: name.trim(),
        sku: sku.trim(),
        location: location.trim(),
        reorder_level: Math.round(reorder),
      });
      onSaved(updated);
      setSaved(true);
    } catch (requestError) {
      if (requestError instanceof ApiError) {
        setErrors(requestError.errors);
        setBanner(requestError.message);
      } else {
        setBanner("Could not save the item.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3" aria-label="Edit item">
      <h3 className="text-sm font-semibold text-slate-900">Edit item</h3>
      {banner ? (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {banner}
        </p>
      ) : null}
      {saved ? (
        <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Item updated.
        </p>
      ) : null}

      <div>
        <label htmlFor="edit-name" className="mb-1 block text-sm font-medium text-slate-700">
          Name
        </label>
        <input
          id="edit-name"
          name="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={inputClass}
        />
        {errors.name ? <p className="mt-1 text-xs text-red-600">{errors.name}</p> : null}
      </div>

      <div>
        <label htmlFor="edit-sku" className="mb-1 block text-sm font-medium text-slate-700">
          SKU
        </label>
        <input
          id="edit-sku"
          name="sku"
          value={sku}
          onChange={(event) => setSku(event.target.value)}
          className={inputClass}
        />
        {errors.sku ? <p className="mt-1 text-xs text-red-600">{errors.sku}</p> : null}
      </div>

      <div>
        <label htmlFor="edit-location" className="mb-1 block text-sm font-medium text-slate-700">
          Location
        </label>
        <input
          id="edit-location"
          name="location"
          value={location}
          onChange={(event) => setLocation(event.target.value)}
          className={inputClass}
        />
        {errors.location ? <p className="mt-1 text-xs text-red-600">{errors.location}</p> : null}
      </div>

      <div>
        <label htmlFor="edit-reorder" className="mb-1 block text-sm font-medium text-slate-700">
          Reorder level
        </label>
        <input
          id="edit-reorder"
          name="reorder_level"
          type="number"
          min={0}
          step={1}
          value={reorderLevel}
          onChange={(event) => setReorderLevel(event.target.value)}
          className={inputClass}
        />
        {errors.reorder_level ? (
          <p className="mt-1 text-xs text-red-600">{errors.reorder_level}</p>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60"
      >
        {busy ? "Saving..." : "Save changes"}
      </button>
    </form>
  );
}

export default function ItemPage({ id }: { id: number }) {
  const { username } = useAuth();
  const { navigate } = useRouter();

  const [item, setItem] = useState<Item | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [itemData, movementData] = await Promise.all([
        api.getItem(id),
        api.listMovements(id),
      ]);
      setItem(itemData);
      setMovements(movementData.items);
      setError(null);
      setMissing(false);
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 404) {
        setMissing(true);
      } else {
        setError(requestError instanceof Error ? requestError.message : "Could not load the item.");
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const remove = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.deleteItem(id);
      navigate("/");
    } catch (requestError) {
      setDeleteError(
        requestError instanceof ApiError ? requestError.message : "Could not delete the item.",
      );
      setDeleting(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-500">Loading item...</p>;
  }

  if (missing || !item) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">Item not found</h1>
        <p className="mt-1 text-sm text-slate-500">{error ?? "This item no longer exists."}</p>
        <button
          type="button"
          onClick={() => navigate("/")}
          className="mt-4 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
        >
          Back to inventory
        </button>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => navigate("/")}
        className="mb-4 text-sm font-medium text-indigo-700 hover:underline"
      >
        &larr; Back to inventory
      </button>

      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{item.name}</h1>
            <p className="mt-1 text-sm text-slate-500">
              SKU {item.sku}
              {item.location ? ` · ${item.location}` : ""}
            </p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold tabular-nums text-slate-900" data-testid="item-quantity">
              {item.quantity}
            </p>
            <p className="text-xs uppercase tracking-wide text-slate-500">In stock</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
            Reorder level: {item.reorder_level}
          </span>
          {item.low_stock ? (
            <span className="rounded-full bg-amber-100 px-3 py-1 font-semibold text-amber-800">
              Low stock
            </span>
          ) : (
            <span className="rounded-full bg-emerald-100 px-3 py-1 font-semibold text-emerald-800">
              In stock
            </span>
          )}
        </div>
      </div>

      {!username ? <AuthPanel /> : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <MovementForm mode="receive" itemId={item.id} onRecorded={load} />
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <MovementForm mode="take" itemId={item.id} onRecorded={load} />
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <EditItemForm item={item} onSaved={setItem} />
          <div className="mt-5 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={() => {
                setDeleteError(null);
                setConfirmOpen(true);
              }}
              className="w-full rounded-md border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50"
            >
              Delete item
            </button>
            {deleteError ? (
              <p role="alert" className="mt-2 text-sm text-red-700">
                {deleteError}
              </p>
            ) : null}
          </div>
        </section>
      </div>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm">
        <h2 className="border-b border-slate-200 px-5 py-4 text-sm font-semibold text-slate-900">
          Movement history
        </h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  When
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  User
                </th>
                <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Change
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Reason
                </th>
                <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Quantity after
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {movements.map((movement) => (
                <tr key={movement.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">
                    {formatTimestamp(movement.created_at)}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{movement.username}</td>
                  <td
                    className={`px-4 py-3 text-right text-sm font-semibold tabular-nums ${
                      movement.delta >= 0 ? "text-emerald-700" : "text-red-700"
                    }`}
                  >
                    {movement.delta >= 0 ? `+${movement.delta}` : movement.delta}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{movement.reason || "-"}</td>
                  <td className="px-4 py-3 text-right text-sm tabular-nums text-slate-900">
                    {movement.quantity_after}
                  </td>
                </tr>
              ))}
              {movements.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">
                    No movements recorded yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <ConfirmDialog
        open={confirmOpen}
        title="Delete item"
        message={`Delete "${item.name}" and all of its movements? This cannot be undone.`}
        confirmLabel="Delete"
        busy={deleting}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={remove}
      />
    </div>
  );
}

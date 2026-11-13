import { useEffect, useState } from "react";
import { api, errorMessage, errorFields } from "./api";
import type { ApiErrors, Item, Movement } from "./api";
import { Button, ErrorBanner, Field, FormErrors, inputClass, prevent } from "./ui";

async function loadMovementForms(
  itemId: number,
): Promise<{ item: Item; movements: Movement[] }> {
  const [item, list] = await Promise.all([
    api.getItem(itemId),
    api.listMovements(itemId),
  ]);
  return { item, movements: list.items };
}

export default function ItemDetail({
  itemId,
  signedIn,
  onBack,
  onEdit,
  onDeleted,
}: {
  itemId: number;
  signedIn: boolean;
  onBack: () => void;
  onEdit: (item: Item) => void;
  onDeleted: () => void;
}) {
  const [item, setItem] = useState<Item | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [receiveQty, setReceiveQty] = useState("");
  const [receiveReason, setReceiveReason] = useState("");
  const [takeQty, setTakeQty] = useState("");
  const [takeReason, setTakeReason] = useState("");
  const [errors, setErrors] = useState<ApiErrors>({});
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState<"receive" | "take" | "delete" | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    loadMovementForms(itemId)
      .then(({ item: loaded, movements: list }) => {
        if (!active) return;
        setItem(loaded);
        setMovements(list);
      })
      .catch((err) => {
        if (active) setLoadError(errorMessage(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [itemId]);

  async function refresh() {
    const loaded = await loadMovementForms(itemId);
    setItem(loaded.item);
    setMovements(loaded.movements);
  }

  async function record(kind: "receive" | "take") {
    const raw = kind === "receive" ? receiveQty : takeQty;
    const reason = kind === "receive" ? receiveReason : takeReason;
    const amount = Number(raw);
    if (!raw.trim() || !Number.isInteger(amount) || amount <= 0) {
      setErrors({
        [kind]: "Enter a whole number greater than 0.",
      });
      return;
    }
    const delta = kind === "receive" ? amount : -amount;
    setBusy(kind);
    setErrors({});
    setActionError("");
    try {
      await api.createMovement(itemId, { delta, reason });
      if (kind === "receive") {
        setReceiveQty("");
        setReceiveReason("");
      } else {
        setTakeQty("");
        setTakeReason("");
      }
      await refresh();
    } catch (err) {
      setActionError(errorMessage(err));
      setErrors(errorFields(err));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("delete");
    setActionError("");
    try {
      await api.deleteItem(itemId);
      onDeleted();
    } catch (err) {
      setActionError(errorMessage(err));
      setConfirming(false);
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return <div className="py-16 text-center text-slate-500">Loading item…</div>;
  }
  if (loadError || !item) {
    return (
      <div className="space-y-4">
        <ErrorBanner message={loadError || "Item not found."} />
        <Button variant="secondary" onClick={onBack}>
          Back to inventory
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="text-sm font-medium text-indigo-600 hover:underline"
          >
            ← Back to inventory
          </button>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">{item.name}</h1>
          <p className="text-sm text-slate-500">
            SKU {item.sku} · {item.location}
          </p>
        </div>
        {signedIn && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => onEdit(item)}>
              Edit
            </Button>
            <Button variant="danger" onClick={() => setConfirming(true)}>
              Delete
            </Button>
          </div>
        )}
      </div>

      {confirming && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-800">
            Delete “{item.name}” and all of its stock movements? This cannot be undone.
          </p>
          <div className="mt-3 flex gap-2">
            <Button variant="danger" disabled={busy === "delete"} onClick={remove}>
              {busy === "delete" ? "Deleting…" : "Yes, delete"}
            </Button>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Quantity on hand
          </div>
          <div className="mt-1 text-3xl font-bold text-slate-900">{item.quantity}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Reorder level
          </div>
          <div className="mt-1 text-3xl font-bold text-slate-900">
            {item.reorder_level}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Status
          </div>
          <div className="mt-2">
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${
                item.low_stock
                  ? "bg-red-100 text-red-700"
                  : "bg-green-100 text-green-700"
              }`}
            >
              {item.low_stock ? "Low stock" : "In stock"}
            </span>
          </div>
        </div>
      </div>

      {signedIn ? (
        <div className="grid gap-4 md:grid-cols-2">
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-green-700">Receive stock</h2>
            <form onSubmit={prevent(() => record("receive"))} className="mt-4 space-y-3">
              <Field label="Quantity" name="receive-qty" error={errors.receive}>
                <input
                  id="receive-qty"
                  type="number"
                  min="1"
                  step="1"
                  className={inputClass}
                  value={receiveQty}
                  onChange={(e) => setReceiveQty(e.target.value)}
                />
              </Field>
              <Field label="Reason (optional)" name="receive-reason">
                <input
                  id="receive-reason"
                  className={inputClass}
                  value={receiveReason}
                  onChange={(e) => setReceiveReason(e.target.value)}
                />
              </Field>
              <Button type="submit" disabled={busy === "receive"}>
                {busy === "receive" ? "Recording…" : "Receive"}
              </Button>
            </form>
          </section>
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-indigo-700">Take out stock</h2>
            <form onSubmit={prevent(() => record("take"))} className="mt-4 space-y-3">
              <Field label="Quantity" name="take-qty" error={errors.take}>
                <input
                  id="take-qty"
                  type="number"
                  min="1"
                  step="1"
                  className={inputClass}
                  value={takeQty}
                  onChange={(e) => setTakeQty(e.target.value)}
                />
              </Field>
              <Field label="Reason (optional)" name="take-reason">
                <input
                  id="take-reason"
                  className={inputClass}
                  value={takeReason}
                  onChange={(e) => setTakeReason(e.target.value)}
                />
              </Field>
              <Button type="submit" variant="secondary" disabled={busy === "take"}>
                {busy === "take" ? "Recording…" : "Take out"}
              </Button>
            </form>
          </section>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          Sign in to record stock movements or manage this item.
        </div>
      )}

      <ErrorBanner message={actionError && Object.keys(errors).length === 0 ? actionError : ""} />
      <FormErrors errors={errors} exclude={["receive", "take"]} />

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Movement history</h2>
          <p className="text-sm text-slate-500">Newest first</p>
        </div>
        {movements.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">
            No stock movements recorded yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 font-medium">Delta</th>
                  <th className="px-5 py-3 font-medium">Quantity after</th>
                  <th className="px-5 py-3 font-medium">Reason</th>
                  <th className="px-5 py-3 font-medium">User</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {movements.map((movement) => (
                  <tr key={movement.id}>
                    <td className="whitespace-nowrap px-5 py-3 text-slate-500">
                      {new Date(movement.created_at).toLocaleString()}
                    </td>
                    <td
                      className={`px-5 py-3 font-semibold ${
                        movement.delta > 0 ? "text-green-700" : "text-red-700"
                      }`}
                    >
                      {movement.delta > 0 ? "+" : ""}
                      {movement.delta}
                    </td>
                    <td className="px-5 py-3 text-slate-700">
                      {movement.quantity_after}
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {movement.reason || "—"}
                    </td>
                    <td className="px-5 py-3 text-slate-600">{movement.username}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

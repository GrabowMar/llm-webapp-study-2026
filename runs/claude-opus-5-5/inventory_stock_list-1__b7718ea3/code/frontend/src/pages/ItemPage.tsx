import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, ApiError, type Item, type Movement } from "../api";
import { useAuth } from "../auth";
import { Link, navigate } from "../router";
import { Alert, Button, Card, Field, Input, LowStockBadge, Spinner, linkButton } from "../components/ui";

function formatDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function MovementForm({
  item,
  kind,
  onRecorded,
}: {
  item: Item;
  kind: "receive" | "take";
  onRecorded: (m: Movement) => void;
}) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isReceive = kind === "receive";
  const prefix = isReceive ? "receive" : "take";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const n = Number(amount);
    if (!amount.trim() || !Number.isInteger(n) || n <= 0) {
      setError("Enter a whole number greater than 0");
      return;
    }
    if (!isReceive && n > item.quantity) {
      setError(`Not enough stock: only ${item.quantity} available`);
      return;
    }
    setBusy(true);
    try {
      const m = await api.addMovement(item.id, isReceive ? n : -n, reason.trim());
      onRecorded(m);
      setAmount("");
      setReason("");
      setSuccess(isReceive ? `Received ${n}` : `Took out ${n}`);
    } catch (err) {
      setError(err instanceof ApiError ? (err.fieldErrors.delta ?? err.message) : "Failed to record movement");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-4">
      <h2 className={`mb-3 text-base font-semibold ${isReceive ? "text-emerald-700" : "text-rose-700"}`}>
        {isReceive ? "Receive" : "Take out"}
      </h2>
      <form onSubmit={submit} className="space-y-3" noValidate aria-label={isReceive ? "Receive stock" : "Take out stock"}>
        <Field label="Quantity" htmlFor={`${prefix}-amount`}>
          <Input
            id={`${prefix}-amount`}
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            invalid={!!error}
          />
        </Field>
        <Field label="Reason (optional)" htmlFor={`${prefix}-reason`}>
          <Input
            id={`${prefix}-reason`}
            value={reason}
            placeholder={isReceive ? "e.g. Delivery from supplier" : "e.g. Order #1234"}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        {error && <Alert>{error}</Alert>}
        {success && <Alert kind="success">{success}</Alert>}
        <Button type="submit" variant={isReceive ? "primary" : "danger"} className="w-full" disabled={busy}>
          {busy ? "Saving…" : isReceive ? "Receive" : "Take out"}
        </Button>
      </form>
    </Card>
  );
}

export function ItemPage({ itemId }: { itemId: number }) {
  const { username } = useAuth();
  const [item, setItem] = useState<Item | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [it, mv] = await Promise.all([api.getItem(itemId), api.listMovements(itemId)]);
      setItem(it);
      setMovements(mv.items);
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setNotFound(true);
      else setError(e instanceof ApiError ? e.message : "Failed to load item");
    } finally {
      setLoading(false);
    }
  }, [itemId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRecorded = (m: Movement) => {
    setItem((prev) =>
      prev ? { ...prev, quantity: m.quantity_after, low_stock: m.quantity_after <= prev.reorder_level } : prev,
    );
    setMovements((prev) => [m, ...prev]);
    void load();
  };

  const doDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.deleteItem(itemId);
      navigate("/");
    } catch (e) {
      setDeleteError(e instanceof ApiError ? e.message : "Failed to delete item");
      setDeleting(false);
    }
  };

  if (loading) return <Spinner />;
  if (notFound)
    return (
      <div className="py-16 text-center">
        <h1 className="text-2xl font-bold">Item not found</h1>
        <Link href="/" className="mt-4 inline-block text-indigo-600 hover:underline">
          Back to inventory
        </Link>
      </div>
    );
  if (!item) return <Alert>{error ?? "Failed to load item"}</Alert>;

  return (
    <div className="space-y-6">
      <Link href="/" className="text-sm text-slate-500 hover:text-indigo-600">
        ← Back to inventory
      </Link>

      {error && <Alert>{error}</Alert>}

      <Card className={`p-6 ${item.low_stock ? "ring-2 ring-amber-300" : ""}`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{item.name}</h1>
              {item.low_stock && <LowStockBadge />}
            </div>
            <p className="mt-1 font-mono text-sm text-slate-500">SKU {item.sku}</p>
          </div>
          {username && (
            <div className="flex gap-2">
              <Link href={`/items/${item.id}/edit`} className={linkButton.secondary}>
                Edit
              </Link>
              <Button variant="danger" onClick={() => setConfirming(true)}>
                Delete
              </Button>
            </div>
          )}
        </div>
        <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div className={`rounded-md p-4 ${item.low_stock ? "bg-amber-50" : "bg-slate-50"}`}>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Quantity</dt>
            <dd
              data-testid="item-quantity"
              className={`mt-1 text-3xl font-bold tabular-nums ${item.low_stock ? "text-amber-700" : "text-slate-900"}`}
            >
              {item.quantity}
            </dd>
          </div>
          <div className="rounded-md bg-slate-50 p-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Reorder level</dt>
            <dd className="mt-1 text-3xl font-bold tabular-nums text-slate-900">{item.reorder_level}</dd>
          </div>
          <div className="rounded-md bg-slate-50 p-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Location</dt>
            <dd className="mt-1 text-xl font-semibold text-slate-900">{item.location || "—"}</dd>
          </div>
        </dl>
      </Card>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <Card className="w-full max-w-md p-6">
            <h2 id="confirm-title" className="text-lg font-semibold">
              Delete “{item.name}”?
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              This permanently deletes the item and its entire movement history. This cannot be undone.
            </p>
            {deleteError && (
              <div className="mt-3">
                <Alert>{deleteError}</Alert>
              </div>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirming(false)} disabled={deleting} autoFocus>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => void doDelete()} disabled={deleting}>
                {deleting ? "Deleting…" : "Delete item"}
              </Button>
            </div>
          </Card>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card className="overflow-hidden">
            <h2 className="border-b border-slate-200 px-4 py-3 text-base font-semibold">Movement history</h2>
            {movements.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-slate-500">No stock movements yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-2">When</th>
                      <th className="px-4 py-2 text-right">Change</th>
                      <th className="px-4 py-2 text-right">After</th>
                      <th className="px-4 py-2">Reason</th>
                      <th className="px-4 py-2">By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {movements.map((m) => (
                      <tr key={m.id}>
                        <td className="whitespace-nowrap px-4 py-2 text-slate-600">{formatDate(m.created_at)}</td>
                        <td
                          className={`px-4 py-2 text-right font-semibold tabular-nums ${
                            m.delta > 0 ? "text-emerald-700" : "text-rose-700"
                          }`}
                        >
                          {m.delta > 0 ? `+${m.delta}` : m.delta}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">{m.quantity_after}</td>
                        <td className="px-4 py-2 text-slate-700">{m.reason || <span className="text-slate-400">—</span>}</td>
                        <td className="px-4 py-2 text-slate-600">{m.username}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
        <div className="space-y-4">
          {username ? (
            <>
              <MovementForm item={item} kind="receive" onRecorded={onRecorded} />
              <MovementForm item={item} kind="take" onRecorded={onRecorded} />
            </>
          ) : (
            <Card className="p-4 text-sm text-slate-600">
              <Link href="/login" className="font-medium text-indigo-600 hover:underline">
                Sign in
              </Link>{" "}
              to receive or take out stock.
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError, type Item, type Movement } from "../api";
import { useAuth } from "../auth";
import {
  btnCls,
  btnDangerCls,
  btnSecondaryCls,
  ErrorBanner,
  Field,
  inputCls,
  LowStockBadge,
} from "../ui";

function MovementForm({
  kind,
  itemId,
  onDone,
}: {
  kind: "receive" | "take";
  itemId: number;
  onDone: () => void;
}) {
  const label = kind === "receive" ? "Receive" : "Take out";
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const id = `${kind}-amount`;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!/^\d+$/.test(amount.trim()) || Number(amount) < 1) {
      setError("Enter a whole number greater than 0");
      return;
    }
    const n = Number(amount);
    setBusy(true);
    try {
      await api.addMovement(itemId, kind === "receive" ? n : -n, reason);
      setAmount("");
      setReason("");
      onDone();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.fields.delta || err.fields.reason || err.message : "Something went wrong",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      aria-label={label}
      className="space-y-3 rounded bg-white p-4 shadow-sm"
    >
      <h2 className="font-semibold">{label}</h2>
      <Field label="Quantity" htmlFor={id} error={error}>
        <input
          id={id}
          inputMode="numeric"
          className={inputCls}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </Field>
      <Field label="Reason" htmlFor={`${kind}-reason`}>
        <input
          id={`${kind}-reason`}
          className={inputCls}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
      <button type="submit" className={kind === "receive" ? btnCls : btnSecondaryCls} disabled={busy}>
        {label}
      </button>
    </form>
  );
}

export default function ItemPage() {
  const { id } = useParams();
  const { username } = useAuth();
  const navigate = useNavigate();
  const [item, setItem] = useState<Item | null>(null);
  const [moves, setMoves] = useState<Movement[]>([]);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [it, mv] = await Promise.all([api.getItem(id!), api.movements(id!)]);
      setItem(it);
      setMoves(mv.items);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function remove() {
    if (!item) return;
    setBusy(true);
    try {
      await api.deleteItem(item.id);
      navigate("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setConfirming(false);
      setBusy(false);
    }
  }

  if (!item) {
    return error ? (
      <div className="space-y-3">
        <ErrorBanner message={error} />
        <Link to="/" className="text-indigo-700 hover:underline">
          Back to inventory
        </Link>
      </div>
    ) : (
      <p>Loading...</p>
    );
  }

  return (
    <div className="space-y-6">
      <Link to="/" className="text-sm text-indigo-700 hover:underline">
        &larr; Back to inventory
      </Link>
      <ErrorBanner message={error} />
      <div className="flex flex-wrap items-start justify-between gap-4 rounded bg-white p-4 shadow-sm">
        <div>
          <h1 className="text-2xl font-semibold">
            {item.name} {item.low_stock && <LowStockBadge />}
          </h1>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-slate-500">SKU</dt>
            <dd>{item.sku}</dd>
            <dt className="text-slate-500">Location</dt>
            <dd>{item.location || "-"}</dd>
            <dt className="text-slate-500">Quantity</dt>
            <dd data-testid="quantity" className="font-semibold">
              {item.quantity}
            </dd>
            <dt className="text-slate-500">Reorder level</dt>
            <dd>{item.reorder_level}</dd>
          </dl>
        </div>
        {username && (
          <div className="flex items-center gap-2">
            {confirming ? (
              <>
                <span className="text-sm">Delete this item and its history?</span>
                <button type="button" className={btnDangerCls} onClick={remove} disabled={busy}>
                  Confirm delete
                </button>
                <button type="button" className={btnSecondaryCls} onClick={() => setConfirming(false)}>
                  Cancel
                </button>
              </>
            ) : (
              <>
                <Link to={`/items/${item.id}/edit`} className={btnSecondaryCls}>
                  Edit
                </Link>
                <button type="button" className={btnDangerCls} onClick={() => setConfirming(true)}>
                  Delete
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {username ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <MovementForm kind="receive" itemId={item.id} onDone={load} />
          <MovementForm kind="take" itemId={item.id} onDone={load} />
        </div>
      ) : (
        <p className="text-sm text-slate-600">
          <Link to="/login" className="text-indigo-700 hover:underline">
            Sign in
          </Link>{" "}
          to receive or take out stock.
        </p>
      )}

      <section>
        <h2 className="mb-2 text-lg font-semibold">Movement history</h2>
        <div className="overflow-x-auto rounded bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-100 text-xs uppercase text-slate-600">
              <tr>
                <th className="px-4 py-2">When</th>
                <th className="px-4 py-2 text-right">Change</th>
                <th className="px-4 py-2 text-right">Quantity after</th>
                <th className="px-4 py-2">Reason</th>
                <th className="px-4 py-2">User</th>
              </tr>
            </thead>
            <tbody>
              {moves.map((m) => (
                <tr key={m.id} className="border-b border-slate-100">
                  <td className="px-4 py-2">{new Date(m.created_at).toLocaleString()}</td>
                  <td
                    className={
                      "px-4 py-2 text-right tabular-nums " +
                      (m.delta > 0 ? "text-green-700" : "text-red-700")
                    }
                  >
                    {m.delta > 0 ? `+${m.delta}` : m.delta}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{m.quantity_after}</td>
                  <td className="px-4 py-2">{m.reason}</td>
                  <td className="px-4 py-2">{m.username ?? "-"}</td>
                </tr>
              ))}
              {moves.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                    No movements yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

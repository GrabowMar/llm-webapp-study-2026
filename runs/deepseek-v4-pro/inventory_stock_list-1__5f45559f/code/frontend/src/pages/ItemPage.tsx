import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { Item, Movement, MovementListResponse } from "../types";

export default function ItemPage({ signedIn }: { signedIn: boolean }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState<Item | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    api<Item>(`/items/${id}`)
      .then(setItem)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
    api<MovementListResponse>(`/items/${id}/movements`)
      .then((res) => setMovements(res.items))
      .catch(() => {});
  }

  useEffect(() => {
    load();
  }, [id]);

  async function record(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api(`/items/${id}/movements`, {
        method: "POST",
        body: JSON.stringify({ delta: Number(delta), reason }),
      });
      setDelta("");
      setReason("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm("Delete this item and its movements?")) return;
    try {
      await api(`/items/${id}`, { method: "DELETE" });
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  if (!item) {
    return (
      <div>
        {error ? (
          <p className="text-red-600">{error}</p>
        ) : (
          <p className="text-gray-500">Loading...</p>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            {item.name}{" "}
            {item.low_stock && (
              <span className="ml-2 align-middle rounded bg-red-200 px-2 py-0.5 text-sm font-medium text-red-800">
                Low stock
              </span>
            )}
          </h1>
          <p className="text-sm text-gray-600">
            SKU {item.sku} · {item.location || "No location"}
          </p>
        </div>
        {signedIn && (
          <div className="flex gap-2">
            <Link
              to={`/items/${item.id}/edit`}
              className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-100"
            >
              Edit
            </Link>
            <button
              onClick={remove}
              className="rounded border border-red-300 px-3 py-1 text-sm text-red-600 hover:bg-red-50"
            >
              Delete
            </button>
          </div>
        )}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-sm text-gray-500">Quantity</div>
          <div className="text-2xl font-semibold">{item.quantity}</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-sm text-gray-500">Reorder level</div>
          <div className="text-2xl font-semibold">{item.reorder_level}</div>
        </div>
      </div>

      {signedIn && (
        <form
          onSubmit={record}
          className="mb-6 space-y-3 rounded-lg border border-gray-200 bg-white p-4"
        >
          <h2 className="font-medium">Record stock movement</h2>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Delta</label>
              <input
                type="number"
                className="rounded border border-gray-300 px-3 py-2"
                value={delta}
                onChange={(e) => setDelta(e.target.value)}
                placeholder="+5 or -5"
                required
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-sm font-medium">Reason</label>
              <input
                className="w-full rounded border border-gray-300 px-3 py-2"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Optional reason"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="rounded bg-green-600 px-4 py-2 font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              Receive
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setDelta(delta ? String(-Math.abs(Number(delta))) : "-1");
              }}
              className="rounded bg-gray-600 px-4 py-2 font-medium text-white hover:bg-gray-700 disabled:opacity-50"
            >
              Take out
            </button>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      )}

      <h2 className="mb-2 font-medium">Movement history</h2>
      {movements.length === 0 ? (
        <p className="text-gray-500">No movements recorded</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-4 py-2 font-medium">When</th>
                <th className="px-4 py-2 font-medium">Delta</th>
                <th className="px-4 py-2 font-medium">After</th>
                <th className="px-4 py-2 font-medium">Reason</th>
                <th className="px-4 py-2 font-medium">By</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((m) => (
                <tr key={m.id} className="border-b border-gray-100">
                  <td className="px-4 py-2">
                    {new Date(m.created_at).toLocaleString()}
                  </td>
                  <td
                    className={
                      "px-4 py-2 " + (m.delta >= 0 ? "text-green-600" : "text-red-600")
                    }
                  >
                    {m.delta > 0 ? "+" : ""}
                    {m.delta}
                  </td>
                  <td className="px-4 py-2">{m.quantity_after}</td>
                  <td className="px-4 py-2">{m.reason}</td>
                  <td className="px-4 py-2">{m.username}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

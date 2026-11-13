import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { Item } from "../types";

export default function ItemForm() {
  const { id } = useParams();
  const editing = id !== undefined;
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [location, setLocation] = useState("");
  const [reorderLevel, setReorderLevel] = useState("0");
  const [quantity, setQuantity] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (editing) {
      api<Item>(`/items/${id}`)
        .then((item) => {
          setName(item.name);
          setSku(item.sku);
          setLocation(item.location);
          setReorderLevel(String(item.reorder_level));
          setQuantity(String(item.quantity));
        })
        .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
    }
  }, [editing, id]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (editing) {
        await api(`/items/${id}`, {
          method: "PUT",
          body: JSON.stringify({
            name,
            sku,
            location,
            reorder_level: Number(reorderLevel),
          }),
        });
        navigate(`/items/${id}`);
      } else {
        const item = await api<Item>("/items", {
          method: "POST",
          body: JSON.stringify({
            name,
            sku,
            location,
            quantity: Number(quantity),
            reorder_level: Number(reorderLevel),
          }),
        });
        navigate(`/items/${item.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-4 text-xl font-semibold">
        {editing ? "Edit item" : "Add item"}
      </h1>
      <form onSubmit={submit} className="space-y-4 rounded-lg border border-gray-200 bg-white p-6">
        <div>
          <label className="mb-1 block text-sm font-medium">Name</label>
          <input
            className="w-full rounded border border-gray-300 px-3 py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">SKU</label>
          <input
            className="w-full rounded border border-gray-300 px-3 py-2"
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Location</label>
          <input
            className="w-full rounded border border-gray-300 px-3 py-2"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Reorder level</label>
          <input
            type="number"
            className="w-full rounded border border-gray-300 px-3 py-2"
            value={reorderLevel}
            onChange={(e) => setReorderLevel(e.target.value)}
          />
        </div>
        {!editing && (
          <div>
            <label className="mb-1 block text-sm font-medium">Opening quantity</label>
            <input
              type="number"
              className="w-full rounded border border-gray-300 px-3 py-2"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={busy}
            className="rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? "Saving..." : editing ? "Save" : "Add item"}
          </button>
          <button
            type="button"
            onClick={() => navigate(editing ? `/items/${id}` : "/")}
            className="rounded border border-gray-300 px-4 py-2 hover:bg-gray-100"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

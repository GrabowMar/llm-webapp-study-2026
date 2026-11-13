import { FormEvent, useEffect, useState } from "react";
import { ApiError, createItem, getItem, updateItem } from "./api";
import type { Item } from "./api";
import { inputCls, navigate } from "./App";

export default function ItemForm({
  mode,
  id,
  onSaved,
}: {
  mode: "new" | "edit";
  id?: number;
  onSaved?: (item: Item) => void;
}) {
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [location, setLocation] = useState("");
  const [quantity, setQuantity] = useState("0");
  const [reorderLevel, setReorderLevel] = useState("0");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(mode === "edit");

  useEffect(() => {
    if (mode !== "edit" || id === undefined) return;
    getItem(id)
      .then((it) => {
        setName(it.name);
        setSku(it.sku);
        setLocation(it.location);
        setQuantity(String(it.quantity));
        setReorderLevel(String(it.reorder_level));
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, [mode, id]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    const body = {
      name: name.trim(),
      sku: sku.trim(),
      location: location.trim(),
      reorder_level: Number(reorderLevel) || 0,
      ...(mode === "new" ? { quantity: Math.max(0, Number(quantity) || 0) } : {}),
    };
    try {
      const saved = mode === "new" ? await createItem(body) : await updateItem(id!, body);
      if (mode === "new") {
        onSaved?.(saved);
      } else {
        navigate(`/items/${saved.id}`);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the item.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <p className="py-10 text-center text-slate-400">Loading…</p>;
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h1 className="text-2xl font-bold text-slate-900">
        {mode === "new" ? "Add item" : "Edit item"}
      </h1>
      <form
        onSubmit={submit}
        className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
      >
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="name">
            Name
          </label>
          <input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className={inputCls}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="sku">
            SKU
          </label>
          <input
            id="sku"
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            required
            className={inputCls}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="location">
            Location
          </label>
          <input
            id="location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Aisle A1"
            className={inputCls}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="quantity">
              {mode === "edit" ? "Current quantity" : "Opening quantity"}
            </label>
            <input
              id="quantity"
              type="number"
              min="0"
              step="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              disabled={mode === "edit"}
              className={`${inputCls} disabled:bg-slate-100 disabled:text-slate-400`}
            />
            {mode === "edit" && (
              <p className="mt-1 text-xs text-slate-400">
                Change the quantity with Receive / Take out movements.
              </p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="reorder">
              Reorder level
            </label>
            <input
              id="reorder"
              type="number"
              min="0"
              step="1"
              value={reorderLevel}
              onChange={(e) => setReorderLevel(e.target.value)}
              className={inputCls}
            />
          </div>
        </div>
        {error && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-60"
          >
            {busy ? "Saving…" : mode === "new" ? "Add item" : "Save changes"}
          </button>
          <button
            type="button"
            onClick={() => (mode === "edit" && id !== undefined ? navigate(`/items/${id}`) : navigate("/"))}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

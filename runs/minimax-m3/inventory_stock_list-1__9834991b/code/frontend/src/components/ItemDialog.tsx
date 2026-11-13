import { useEffect, useState, type FormEvent } from "react";
import { ApiError, api } from "../api";
import type { Item } from "../types";
import Modal from "./Modal";

interface ItemDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (item: Item) => void;
}

const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";

export default function ItemDialog({ open, onClose, onCreated }: ItemDialogProps) {
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [location, setLocation] = useState("");
  const [quantity, setQuantity] = useState("0");
  const [reorderLevel, setReorderLevel] = useState("0");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setSku("");
      setLocation("");
      setQuantity("0");
      setReorderLevel("0");
      setErrors({});
      setBanner(null);
    }
  }, [open]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setErrors({});
    setBanner(null);

    const nextErrors: Record<string, string> = {};
    if (!name.trim()) nextErrors.name = "Name is required.";
    if (!sku.trim()) nextErrors.sku = "SKU is required.";
    const openingQuantity = Number(quantity);
    if (!Number.isFinite(openingQuantity) || openingQuantity < 0) {
      nextErrors.quantity = "Quantity must be 0 or more.";
    }
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
      const item = await api.createItem({
        name: name.trim(),
        sku: sku.trim(),
        location: location.trim(),
        quantity: Math.round(openingQuantity),
        reorder_level: Math.round(reorder),
      });
      onCreated(item);
      onClose();
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.errors);
        setBanner(error.message);
      } else {
        setBanner("Could not create the item.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} title="Add item" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {banner ? (
          <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {banner}
          </p>
        ) : null}

        <div>
          <label htmlFor="item-name" className="mb-1 block text-sm font-medium text-slate-700">
            Name
          </label>
          <input
            id="item-name"
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={inputClass}
          />
          {errors.name ? <p className="mt-1 text-xs text-red-600">{errors.name}</p> : null}
        </div>

        <div>
          <label htmlFor="item-sku" className="mb-1 block text-sm font-medium text-slate-700">
            SKU
          </label>
          <input
            id="item-sku"
            name="sku"
            value={sku}
            onChange={(event) => setSku(event.target.value)}
            className={inputClass}
          />
          {errors.sku ? <p className="mt-1 text-xs text-red-600">{errors.sku}</p> : null}
        </div>

        <div>
          <label htmlFor="item-location" className="mb-1 block text-sm font-medium text-slate-700">
            Location
          </label>
          <input
            id="item-location"
            name="location"
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            className={inputClass}
          />
          {errors.location ? <p className="mt-1 text-xs text-red-600">{errors.location}</p> : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="item-quantity" className="mb-1 block text-sm font-medium text-slate-700">
              Opening quantity
            </label>
            <input
              id="item-quantity"
              name="quantity"
              type="number"
              min={0}
              step={1}
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              className={inputClass}
            />
            {errors.quantity ? <p className="mt-1 text-xs text-red-600">{errors.quantity}</p> : null}
          </div>

          <div>
            <label htmlFor="item-reorder" className="mb-1 block text-sm font-medium text-slate-700">
              Reorder level
            </label>
            <input
              id="item-reorder"
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
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60"
          >
            {busy ? "Saving..." : "Create item"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

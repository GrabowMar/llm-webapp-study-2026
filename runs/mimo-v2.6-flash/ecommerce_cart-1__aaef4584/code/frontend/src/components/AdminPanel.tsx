import { useState, type FormEvent } from "react";
import { errorMessage } from "../api";
import type { Product } from "../types";

type Props = {
  onCreated: () => Promise<void> | void;
  onCreate: (body: {
    name: string;
    description: string;
    price: number;
    stock: number;
    is_active: boolean;
  }) => Promise<Product>;
};

export default function AdminPanel({ onCreated, onCreate }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("10");
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");

    const priceValue = Number(price);
    const stockValue = Number(stock);
    if (!name.trim()) {
      setError("name is required");
      return;
    }
    if (!Number.isFinite(priceValue) || priceValue < 0) {
      setError("price must be a non-negative number");
      return;
    }
    if (!Number.isInteger(stockValue) || stockValue < 0) {
      setError("stock must be a non-negative integer");
      return;
    }

    setBusy(true);
    try {
      await onCreate({
        name: name.trim(),
        description,
        price: priceValue,
        stock: stockValue,
        is_active: isActive,
      });
      setName("");
      setDescription("");
      setPrice("");
      setStock("10");
      setIsActive(true);
      setNotice("Product added.");
      await onCreated();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mb-8 rounded-xl border border-indigo-200 bg-indigo-50/60 p-4">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-indigo-700">
        Admin · add product
      </h2>
      <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <label className="block lg:col-span-2">
          <span className="mb-1 block text-xs font-medium text-slate-600">Name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          />
        </label>
        <label className="block lg:col-span-2">
          <span className="mb-1 block text-xs font-medium text-slate-600">Description</span>
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Price</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            required
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Stock</span>
          <input
            type="number"
            min="0"
            step="1"
            value={stock}
            onChange={(event) => setStock(event.target.value)}
            required
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          />
        </label>

        <div className="flex items-end gap-4 sm:col-span-2 lg:col-span-6">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(event) => setIsActive(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 accent-indigo-600"
            />
            Active
          </label>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60"
          >
            {busy ? "Adding…" : "Add product"}
          </button>
          {notice && <span className="text-sm text-green-700">{notice}</span>}
          {error && <span className="text-sm text-red-600">{error}</span>}
        </div>
      </form>
    </section>
  );
}

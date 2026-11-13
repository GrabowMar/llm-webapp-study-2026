import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "./api";
import { money, type Product } from "./types";

interface Props {
  onCatalogueChange: () => void;
}

interface Draft {
  name: string;
  description: string;
  price: string;
  stock: string;
}

const EMPTY_DRAFT: Draft = { name: "", description: "", price: "", stock: "0" };

export default function AdminPanel({ onCatalogueChange }: Props) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<{ price: string; stock: string }>({
    price: "",
    stock: "",
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api<{ items: Product[] }>("/api/admin/products");
      setProducts(result.items);
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to load products.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function flash(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 2500);
  }

  async function createProduct(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const price = Number(draft.price);
    const stock = Number(draft.stock);
    if (!draft.name.trim()) {
      setError("Name is required.");
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setError("Price must be a non-negative number.");
      return;
    }
    if (!Number.isInteger(stock) || stock < 0) {
      setError("Stock must be a non-negative whole number.");
      return;
    }
    setCreating(true);
    try {
      await api("/api/admin/products", {
        method: "POST",
        body: {
          name: draft.name.trim(),
          description: draft.description,
          price,
          stock,
          is_active: true,
        },
      });
      setDraft(EMPTY_DRAFT);
      await load();
      onCatalogueChange();
      flash("Product added.");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to add product.");
    } finally {
      setCreating(false);
    }
  }

  function startEditing(product: Product) {
    setEditingId(product.id);
    setEditDraft({ price: String(product.price), stock: String(product.stock) });
    setError(null);
  }

  async function saveEdit(product: Product) {
    setError(null);
    const price = Number(editDraft.price);
    const stock = Number(editDraft.stock);
    if (!Number.isFinite(price) || price < 0) {
      setError("Price must be a non-negative number.");
      return;
    }
    if (!Number.isInteger(stock) || stock < 0) {
      setError("Stock must be a non-negative whole number.");
      return;
    }
    setSaving(true);
    try {
      const updated = await api<Product>(`/api/admin/products/${product.id}`, {
        method: "PATCH",
        body: { price, stock },
      });
      setProducts((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setEditingId(null);
      onCatalogueChange();
      flash("Product updated.");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to update product.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(product: Product) {
    setError(null);
    try {
      const updated = await api<Product>(`/api/admin/products/${product.id}`, {
        method: "PATCH",
        body: { is_active: !product.is_active },
      });
      setProducts((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      onCatalogueChange();
      flash(updated.is_active ? "Product activated." : "Product deactivated.");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to update product.");
    }
  }

  return (
    <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Admin</h2>
        <p className="text-sm text-slate-500">
          Add products and adjust prices, stock and visibility.
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-700">{notice}</p>
      )}

      <form onSubmit={createProduct} className="grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
        <label className="sm:col-span-2">
          <span className="mb-1 block text-sm font-medium text-slate-700">Name</span>
          <input
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            placeholder="New product"
          />
        </label>
        <label className="sm:col-span-2">
          <span className="mb-1 block text-sm font-medium text-slate-700">Description</span>
          <input
            value={draft.description}
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            placeholder="Short description"
          />
        </label>
        <label>
          <span className="mb-1 block text-sm font-medium text-slate-700">Price</span>
          <input
            value={draft.price}
            onChange={(event) => setDraft({ ...draft, price: event.target.value })}
            inputMode="decimal"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            placeholder="0.00"
          />
        </label>
        <label>
          <span className="mb-1 block text-sm font-medium text-slate-700">Stock</span>
          <input
            value={draft.stock}
            onChange={(event) => setDraft({ ...draft, stock: event.target.value })}
            inputMode="numeric"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            placeholder="0"
          />
        </label>
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={creating}
            className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:opacity-60"
          >
            {creating ? "Adding…" : "Add product"}
          </button>
        </div>
      </form>

      <div className="overflow-x-auto">
        {loading ? (
          <p className="py-8 text-center text-sm text-slate-500">Loading products…</p>
        ) : (
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-3 font-medium">Product</th>
                <th className="py-2 pr-3 font-medium">Price</th>
                <th className="py-2 pr-3 font-medium">Stock</th>
                <th className="py-2 pr-3 font-medium">Active</th>
                <th className="py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => {
                const editing = editingId === product.id;
                return (
                  <tr key={product.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-3 pr-3">
                      <p className="font-medium text-slate-900">{product.name}</p>
                      <p className="text-xs text-slate-400">{product.description || "—"}</p>
                    </td>
                    <td className="py-3 pr-3">
                      {editing ? (
                        <input
                          value={editDraft.price}
                          onChange={(event) =>
                            setEditDraft({ ...editDraft, price: event.target.value })
                          }
                          inputMode="decimal"
                          className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm outline-none focus:border-teal-500"
                        />
                      ) : (
                        <span className="text-slate-700">{money(product.price)}</span>
                      )}
                    </td>
                    <td className="py-3 pr-3">
                      {editing ? (
                        <input
                          value={editDraft.stock}
                          onChange={(event) =>
                            setEditDraft({ ...editDraft, stock: event.target.value })
                          }
                          inputMode="numeric"
                          className="w-20 rounded-md border border-slate-300 px-2 py-1 text-sm outline-none focus:border-teal-500"
                        />
                      ) : (
                        <span className={product.stock <= 0 ? "text-rose-600" : "text-slate-700"}>
                          {product.stock}
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-3">
                      <select
                        value={product.is_active ? "yes" : "no"}
                        onChange={() => toggleActive(product)}
                        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm outline-none focus:border-teal-500"
                      >
                        <option value="yes">Active</option>
                        <option value="no">Inactive</option>
                      </select>
                    </td>
                    <td className="py-3 text-right">
                      {editing ? (
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => saveEdit(product)}
                            disabled={saving}
                            className="rounded-md bg-teal-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEditing(product)}
                          className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                        >
                          Edit
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

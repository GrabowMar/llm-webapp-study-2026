import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { Product, ProductPage } from "../lib/api";
import { api, errorMessage } from "../lib/api";

interface Draft {
  price: string;
  stock: string;
  is_active: boolean;
}

function draftOf(product: Product): Draft {
  return {
    price: product.price.toFixed(2),
    stock: String(product.stock),
    is_active: product.is_active,
  };
}

export default function AdminPanel() {
  const [products, setProducts] = useState<Product[]>([]);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [form, setForm] = useState({
    name: "",
    description: "",
    price: "",
    stock: "10",
    is_active: true,
  });
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      const res = await api<ProductPage>("/admin/products?page_size=500");
      setProducts(res.items);
      const next: Record<number, Draft> = {};
      for (const product of res.items) next[product.id] = draftOf(product);
      setDrafts(next);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setDraft(id: number, patch: Partial<Draft>) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  async function createProduct(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFlash(null);
    try {
      const created = await api<Product>("/admin/products", {
        method: "POST",
        body: {
          name: form.name,
          description: form.description,
          price: Number(form.price),
          stock: Number(form.stock),
          is_active: form.is_active,
        },
      });
      setFlash(`Added “${created.name}”`);
      setForm({ name: "", description: "", price: "", stock: "10", is_active: true });
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveProduct(product: Product) {
    const draft = drafts[product.id];
    setBusy(true);
    setError(null);
    setFlash(null);
    try {
      const updated = await api<Product>(`/admin/products/${product.id}`, {
        method: "PATCH",
        body: {
          price: Number(draft.price),
          stock: Number(draft.stock),
          is_active: draft.is_active,
        },
      });
      setFlash(`Saved “${updated.name}”`);
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-8">
      <div>
        <h2 className="mb-4 text-xl font-semibold text-slate-900">Add a product</h2>
        <form
          onSubmit={createProduct}
          className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-2"
        >
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Price</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate-700">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Stock</label>
            <input
              type="number"
              min="0"
              step="1"
              value={form.stock}
              onChange={(e) => setForm({ ...form, stock: e.target.value })}
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600"
              />
              Active (visible in the catalogue)
            </label>
          </div>
          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              Add product
            </button>
          </div>
        </form>
      </div>

      <div>
        <h2 className="mb-4 text-xl font-semibold text-slate-900">Edit products</h2>
        {error && (
          <p className="mb-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
        )}
        {flash && (
          <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {flash}
          </p>
        )}
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Stock</th>
                <th className="px-4 py-3">Active</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {products.map((product) => {
                const draft = drafts[product.id] ?? draftOf(product);
                return (
                  <tr key={product.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{product.name}</p>
                      <p className="line-clamp-1 text-xs text-slate-500">{product.description}</p>
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={draft.price}
                        onChange={(e) => setDraft(product.id, { price: e.target.value })}
                        className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-indigo-500"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={draft.stock}
                        onChange={(e) => setDraft(product.id, { stock: e.target.value })}
                        className="w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-indigo-500"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={draft.is_active}
                        onChange={(e) =>
                          setDraft(product.id, { is_active: e.target.checked })
                        }
                        aria-label={`${product.name} is active`}
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => saveProduct(product)}
                        disabled={busy}
                        className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
                      >
                        Save
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Price and stock changes take effect immediately in the store and in every cart;
          deactivating a product hides it from the catalogue.
        </p>
      </div>
    </section>
  );
}

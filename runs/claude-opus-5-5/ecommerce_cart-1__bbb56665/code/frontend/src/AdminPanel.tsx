import { useCallback, useEffect, useState } from "react";
import { api, ApiError, formatPrice, type Page, type Product } from "./api";

const PAGE_SIZE = 10;

type Props = { onCatalogueChanged: () => void };

export default function AdminPanel({ onCatalogueChanged }: Props) {
  const [data, setData] = useState<Page<Product> | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api<Page<Product>>(`/admin/products?page=${page}&page_size=${PAGE_SIZE}`));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load products");
    }
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  async function changed() {
    await load();
    onCatalogueChanged();
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <section className="mt-10 rounded-xl border border-amber-200 bg-amber-50/40 p-5" aria-label="Admin">
      <h2 className="text-lg font-semibold text-slate-900">Admin · Products</h2>
      <ProductForm onCreated={changed} />
      {error && (
        <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Price</th>
              <th className="px-3 py-2">Stock</th>
              <th className="px-3 py-2">Active</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data?.items.map((p) => <AdminRow key={p.id} product={p} onSaved={changed} />)}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="mt-3 flex items-center justify-end gap-2 text-sm">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="rounded-md border border-slate-300 bg-white px-3 py-1 disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-slate-600">
            Page {page} of {pages}
          </span>
          <button
            type="button"
            disabled={page >= pages}
            onClick={() => setPage(page + 1)}
            className="rounded-md border border-slate-300 bg-white px-3 py-1 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </section>
  );
}

const inputClass =
  "rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

function ProductForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("0");
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const created = await api<Product>("/admin/products", {
        method: "POST",
        body: {
          name,
          description,
          price: price.trim() === "" ? null : Number(price),
          stock: stock.trim() === "" ? 0 : Number(stock),
          is_active: isActive,
        },
      });
      setNotice(`Added “${created.name}”.`);
      setName("");
      setDescription("");
      setPrice("");
      setStock("0");
      setIsActive(true);
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add product");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} aria-label="Add product" className="mt-4 grid gap-3 sm:grid-cols-6">
      <input
        aria-label="Name"
        placeholder="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        className={`${inputClass} sm:col-span-2`}
      />
      <input
        aria-label="Description"
        placeholder="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className={`${inputClass} sm:col-span-4`}
      />
      <input
        aria-label="Price"
        placeholder="Price"
        type="number"
        step="0.01"
        min="0"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        required
        className={`${inputClass} sm:col-span-2`}
      />
      <input
        aria-label="Stock"
        placeholder="Stock"
        type="number"
        step="1"
        min="0"
        value={stock}
        onChange={(e) => setStock(e.target.value)}
        className={`${inputClass} sm:col-span-2`}
      />
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        Active
      </label>
      <button
        type="submit"
        disabled={busy}
        className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
      >
        Add product
      </button>
      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-6">
          {error}
        </p>
      )}
      {notice && <p className="text-sm text-green-700 sm:col-span-6">{notice}</p>}
    </form>
  );
}

function AdminRow({ product, onSaved }: { product: Product; onSaved: () => void }) {
  const [price, setPrice] = useState(String(product.price));
  const [stock, setStock] = useState(String(product.stock));
  const [active, setActive] = useState(product.is_active);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPrice(String(product.price));
    setStock(String(product.stock));
    setActive(product.is_active);
  }, [product]);

  const dirty = price !== String(product.price) || stock !== String(product.stock) || active !== product.is_active;

  async function save() {
    setError(null);
    setBusy(true);
    const body: Record<string, unknown> = {};
    if (price !== String(product.price)) body.price = price.trim() === "" ? null : Number(price);
    if (stock !== String(product.stock)) body.stock = stock.trim() === "" ? null : Number(stock);
    if (active !== product.is_active) body.is_active = active;
    try {
      await api<Product>(`/admin/products/${product.id}`, { method: "PATCH", body });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className={product.is_active ? "" : "bg-slate-50 text-slate-500"}>
      <td className="px-3 py-2">
        <div className="font-medium">{product.name}</div>
        <div className="text-xs text-slate-400">#{product.id} · {formatPrice(product.price)}</div>
        {error && (
          <div role="alert" className="mt-1 text-xs text-red-600">
            {error}
          </div>
        )}
      </td>
      <td className="px-3 py-2">
        <input
          aria-label={`Price of ${product.name}`}
          type="number"
          step="0.01"
          min="0"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className={`${inputClass} w-28`}
        />
      </td>
      <td className="px-3 py-2">
        <input
          aria-label={`Stock of ${product.name}`}
          type="number"
          step="1"
          min="0"
          value={stock}
          onChange={(e) => setStock(e.target.value)}
          className={`${inputClass} w-24`}
        />
      </td>
      <td className="px-3 py-2">
        <input
          aria-label={`Active status of ${product.name}`}
          type="checkbox"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
        />
      </td>
      <td className="px-3 py-2 text-right">
        <button
          type="button"
          disabled={!dirty || busy}
          onClick={save}
          className="rounded-md bg-slate-800 px-3 py-1 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-30"
        >
          Save
        </button>
      </td>
    </tr>
  );
}

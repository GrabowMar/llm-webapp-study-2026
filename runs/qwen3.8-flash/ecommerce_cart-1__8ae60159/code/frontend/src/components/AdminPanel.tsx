import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import type { Product } from "../types";

type Draft = { name: string; description: string; price: string; stock: string };

const EMPTY_DRAFT: Draft = { name: "", description: "", price: "", stock: "" };

export default function AdminPanel({ token }: { token: string }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    api
      .adminListProducts(token)
      .then(setProducts)
      .catch((err) =>
        setMessage({ kind: "err", text: err instanceof Error ? err.message : "Failed to load" }),
      );
  }, [token]);

  useEffect(refresh, [refresh]);

  async function createProduct(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setBusy(true);
    try {
      await api.adminCreateProduct(token, {
        name: draft.name.trim(),
        description: draft.description.trim(),
        price: parseMoney(draft.price),
        stock: parseStock(draft.stock),
      });
      setDraft(EMPTY_DRAFT);
      setMessage({ kind: "ok", text: "Product added." });
      refresh();
    } catch (err) {
      setMessage({ kind: "err", text: err instanceof Error ? err.message : "Failed to add" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-6">
      <h2 className="text-lg font-semibold text-slate-900">Admin</h2>

      <form
        onSubmit={createProduct}
        className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <h3 className="font-semibold text-slate-800">Add a product</h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Name">
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              required
              className={inputClass}
            />
          </Field>
          <Field label="Description">
            <input
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label="Price">
            <input
              value={draft.price}
              onChange={(e) => setDraft({ ...draft, price: e.target.value })}
              inputMode="decimal"
              placeholder="0.00"
              required
              className={inputClass}
            />
          </Field>
          <Field label="Stock">
            <input
              value={draft.stock}
              onChange={(e) => setDraft({ ...draft, stock: e.target.value })}
              inputMode="numeric"
              placeholder="0"
              required
              className={inputClass}
            />
          </Field>
        </div>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-700 disabled:opacity-60"
        >
          Add product
        </button>
      </form>

      {message && (
        <p
          className={`rounded-lg px-3 py-2 text-sm ${
            message.kind === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </p>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Price</th>
              <th className="px-4 py-3">Stock</th>
              <th className="px-4 py-3">Active</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <AdminRow key={p.id} token={token} product={p} onSaved={refresh} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function parseMoney(value: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new Error("Price must be a number of at least 0");
  return Math.round(n * 100) / 100;
}

function parseStock(value: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new Error("Stock must be a whole number of at least 0");
  return n;
}

function AdminRow({
  token,
  product,
  onSaved,
}: {
  token: string;
  product: Product;
  onSaved: () => void;
}) {
  const [price, setPrice] = useState(String(product.price));
  const [stock, setStock] = useState(String(product.stock));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(fields: Record<string, unknown>) {
    setError(null);
    setSaved(false);
    try {
      await api.adminUpdateProduct(token, product.id, fields);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    }
  }

  function commitPrice() {
    const parsed = Number(price);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setError("Price must be a number of at least 0");
      return;
    }
    const rounded = Math.round(parsed * 100) / 100;
    if (rounded !== product.price) void save({ price: rounded });
    else setPrice(String(product.price));
  }

  function commitStock() {
    const parsed = Number(stock);
    if (!Number.isInteger(parsed) || parsed < 0) {
      setError("Stock must be a whole number of at least 0");
      return;
    }
    if (parsed !== product.stock) void save({ stock: parsed });
  }

  return (
    <tr className="border-b border-slate-100 last:border-0">
      <td className="px-4 py-2.5 align-middle">
        <div className="font-medium text-slate-900">{product.name}</div>
        <div className="max-w-56 truncate text-xs text-slate-400">{product.description}</div>
        {error && <div className="text-xs text-red-600">{error}</div>}
        {saved && !error && <div className="text-xs text-emerald-600">Saved</div>}
      </td>
      <td className="px-4 py-2.5 align-middle">
        <input
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          onBlur={commitPrice}
          onKeyDown={(e) => e.key === "Enter" && commitPrice()}
          inputMode="decimal"
          className={`${inputClass} w-24`}
          aria-label={`Price of ${product.name}`}
        />
      </td>
      <td className="px-4 py-2.5 align-middle">
        <input
          value={stock}
          onChange={(e) => setStock(e.target.value)}
          onBlur={commitStock}
          onKeyDown={(e) => e.key === "Enter" && commitStock()}
          inputMode="numeric"
          className={`${inputClass} w-20`}
          aria-label={`Stock of ${product.name}`}
        />
      </td>
      <td className="px-4 py-2.5 align-middle">
        <button
          type="button"
          role="switch"
          aria-checked={product.is_active}
          onClick={() => void save({ is_active: !product.is_active })}
          className={`relative h-6 w-11 rounded-full transition ${
            product.is_active ? "bg-emerald-500" : "bg-slate-300"
          }`}
          title={product.is_active ? "Active — click to hide" : "Inactive — click to show"}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
              product.is_active ? "left-5.5" : "left-0.5"
            }`}
          />
        </button>
      </td>
      <td className="px-4 py-2.5 align-middle">
        <span className="text-xs text-slate-400">#{product.id}</span>
      </td>
    </tr>
  );
}

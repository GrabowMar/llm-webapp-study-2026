import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, ApiError, type Page, type Product } from "./api";

const input = "rounded border border-slate-300 px-2 py-1 text-sm";
const btn =
  "rounded bg-slate-800 px-3 py-1 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50";

function Row({ p, onSaved }: { p: Product; onSaved: () => void }) {
  const [price, setPrice] = useState(String(p.price));
  const [stock, setStock] = useState(String(p.stock));
  const [active, setActive] = useState(p.is_active);
  const [error, setError] = useState("");

  useEffect(() => {
    setPrice(String(p.price));
    setStock(String(p.stock));
    setActive(p.is_active);
  }, [p]);

  const save = async () => {
    setError("");
    const priceNum = Number(price);
    const stockNum = Number(stock);
    if (price.trim() === "" || stock.trim() === "") {
      setError("Price and stock are required");
      return;
    }
    try {
      await api("PATCH", `/admin/products/${p.id}`, {
        price: priceNum,
        stock: stockNum,
        is_active: active,
      });
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong");
    }
  };

  return (
    <tr className="border-t align-top">
      <td className="py-2 pr-2">{p.name}</td>
      <td className="pr-2">
        <input
          aria-label={`Price of ${p.name}`}
          className={`${input} w-24`}
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
      </td>
      <td className="pr-2">
        <input
          aria-label={`Stock of ${p.name}`}
          className={`${input} w-20`}
          inputMode="numeric"
          value={stock}
          onChange={(e) => setStock(e.target.value)}
        />
      </td>
      <td className="pr-2">
        <input
          type="checkbox"
          aria-label={`Active ${p.name}`}
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
        />
      </td>
      <td>
        <button className={btn} onClick={save}>
          Save
        </button>
        {error && <p role="alert" className="mt-1 text-xs text-red-700">{error}</p>}
      </td>
    </tr>
  );
}

export default function AdminPanel({ onChanged }: { onChanged: () => void }) {
  const [items, setItems] = useState<Product[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("0");
  const [formError, setFormError] = useState("");
  const size = 10;

  const load = useCallback(async () => {
    try {
      const d = await api<Page>("GET", `/admin/products?page=${page}&page_size=${size}`);
      setItems(d.items);
      setTotal(d.total);
      setError("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load");
    }
  }, [page]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setFormError("");
    try {
      await api("POST", "/admin/products", {
        name,
        description,
        price: Number(price),
        stock: Number(stock),
      });
      setName("");
      setDescription("");
      setPrice("");
      setStock("0");
      await load();
      onChanged();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  };

  const pages = Math.max(1, Math.ceil(total / size));

  return (
    <section className="space-y-6">
      <form onSubmit={create} className="space-y-3 rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold">Add product</h2>
        <div className="flex flex-wrap gap-3">
          <input
            className={`${input} w-48`}
            placeholder="Name"
            aria-label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <input
            className={`${input} w-64`}
            placeholder="Description"
            aria-label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <input
            className={`${input} w-28`}
            placeholder="Price"
            aria-label="Price"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            required
          />
          <input
            className={`${input} w-24`}
            placeholder="Stock"
            aria-label="Stock"
            inputMode="numeric"
            value={stock}
            onChange={(e) => setStock(e.target.value)}
            required
          />
          <button className={btn} type="submit">
            Add
          </button>
        </div>
        {formError && <p role="alert" className="text-sm text-red-700">{formError}</p>}
      </form>

      <div className="overflow-x-auto rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-lg font-semibold">Products</h2>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="pb-2">Name</th>
              <th>Price</th>
              <th>Stock</th>
              <th>Active</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <Row
                key={p.id}
                p={p}
                onSaved={() => {
                  void load();
                  onChanged();
                }}
              />
            ))}
          </tbody>
        </table>
        <div className="mt-4 flex items-center gap-3 text-sm">
          <button className="rounded border px-3 py-1 disabled:opacity-40" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous
          </button>
          <span>Page {page} of {pages}</span>
          <button className="rounded border px-3 py-1 disabled:opacity-40" disabled={page >= pages} onClick={() => setPage(page + 1)}>
            Next
          </button>
        </div>
      </div>
    </section>
  );
}

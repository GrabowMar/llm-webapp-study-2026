import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, category, money } from "./api";
import type { Product, ProductPage } from "./api";
import { inputClass, primaryButton } from "./AuthForm";
import { Icon } from "./Icons";
import { ErrorMessage } from "./Modal";

function ProductRow({ product, token, onSaved }: { product: Product; token: string; onSaved: () => void }) {
  const [price, setPrice] = useState(product.price.toFixed(2));
  const [stock, setStock] = useState(String(product.stock));
  const [active, setActive] = useState(product.is_active);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dirty = Number(price) !== product.price || Number(stock) !== product.stock || active !== product.is_active;
  async function save() {
    setBusy(true);
    setError("");
    try {
      if (!price.trim() || !stock.trim()) throw new Error("Price and stock are required.");
      await api(`/admin/products/${product.id}`, { method: "PATCH", body: JSON.stringify({ price: Number(price), stock: Number(stock), is_active: active }) }, token);
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn’t update this product.");
    } finally {
      setBusy(false);
    }
  }
  return <>
    <tr className="border-b border-line/70">
      <td className="py-5 pr-5"><p className="text-sm font-medium">{product.name}</p><p className="mt-1 text-xs text-muted">{category(product)} · #{product.id}</p></td>
      <td className="px-3"><div className="relative w-28"><span className="absolute top-2.5 left-3 text-sm text-muted">$</span><input aria-label={`Price for ${product.name}`} type="number" min="0" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} className={`${inputClass} py-2! pl-7!`} /></div></td>
      <td className="px-3"><input aria-label={`Stock for ${product.name}`} type="number" min="0" step="1" value={stock} onChange={(event) => setStock(event.target.value)} className={`${inputClass} w-24! py-2!`} /></td>
      <td className="px-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} aria-label={`Active status for ${product.name}`} className="h-4 w-4 accent-rust" />{active ? "Active" : "Hidden"}</label></td>
      <td className="pl-3 text-right"><button disabled={!dirty || busy} onClick={save} className="inline-flex items-center gap-2 rounded-md border border-line px-4 py-2 text-sm text-rust transition hover:border-rust disabled:text-muted disabled:opacity-50">{busy ? <Icon name="loader" className="h-4 w-4 animate-spin" /> : <Icon name="check" className="h-4 w-4" />}Save</button></td>
    </tr>
    {error && <tr><td colSpan={5} className="py-3"><ErrorMessage message={error} /></td></tr>}
  </>;
}

export function Admin({ token, onChange, onBack }: { token: string; onChange: () => void; onBack: () => void }) {
  const [products, setProducts] = useState<ProductPage | null>(null);
  const [page, setPage] = useState(1);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [details, setDetails] = useState("");
  const [group, setGroup] = useState("Home & living");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("10");
  const [active, setActive] = useState(true);

  useEffect(() => {
    let ignore = false;
    api<ProductPage>(`/admin/products?page=${page}&page_size=10`, {}, token).then((data) => {
      if (!ignore) setProducts(data);
    }).catch((caught: Error) => { if (!ignore) setError(caught.message); });
    return () => { ignore = true; };
  }, [token, page, version]);

  function updated() {
    setVersion((value) => value + 1);
    setNotice("Product saved. The catalogue and cart now use the updated details.");
    onChange();
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const product = await api<Product>("/admin/products", { method: "POST", body: JSON.stringify({ name, description: `${group} · ${details}`, price: Number(price), stock: Number(stock), is_active: active }) }, token);
      setName(""); setDetails(""); setPrice(""); setStock("10"); setActive(true);
      setPage(1);
      setVersion((value) => value + 1);
      setNotice(`${product.name} added at ${money(product.price)}.`);
      onChange();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn’t create the product.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="mx-auto max-w-[1280px] px-5 py-10 sm:px-8 lg:px-12">
    <button onClick={onBack} className="mb-8 inline-flex items-center gap-2 text-sm text-muted hover:text-rust"><Icon name="chevron-left" className="h-4 w-4" />Back to the collection</button>
    <div className="mb-9"><p className="mb-3 text-[10px] font-medium tracking-[.2em] text-rust uppercase">Behind the collection</p><h1 className="font-serif text-4xl">The product workspace.</h1><p className="mt-3 text-sm text-muted">A considered catalogue starts here. Updates are reflected in every cart.</p></div>
    <div className="mb-6 space-y-3"><ErrorMessage message={error} />{notice && <p role="status" className="rounded-lg border border-[#a6b294]/40 bg-[#eaf0e3] px-4 py-3 text-sm text-[#52663d]">{notice}</p>}</div>
    <section className="mb-10 rounded-xl border border-line bg-white p-6 sm:p-8">
      <h2 className="mb-6 font-serif text-2xl">Add something good.</h2>
      <form onSubmit={create} className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm font-medium sm:col-span-2">Product name<input required maxLength={150} value={name} onChange={(event) => setName(event.target.value)} className={`${inputClass} mt-2`} placeholder="A name for your object" /></label>
        <label className="text-sm font-medium">Price ($)<input required type="number" min="0" max="1000000" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} className={`${inputClass} mt-2`} placeholder="0.00" /></label>
        <label className="text-sm font-medium">Stock<input required type="number" min="0" max="1000000" step="1" value={stock} onChange={(event) => setStock(event.target.value)} className={`${inputClass} mt-2`} /></label>
        <label className="text-sm font-medium sm:col-span-2">Description<input maxLength={1800} value={details} onChange={(event) => setDetails(event.target.value)} className={`${inputClass} mt-2`} placeholder="What makes it special?" /></label>
        <label className="text-sm font-medium">Category<select value={group} onChange={(event) => setGroup(event.target.value)} className={`${inputClass} mt-2`}>{["Home & living", "Kitchen & dining", "Everyday essentials"].map((label) => <option key={label}>{label}</option>)}</select></label>
        <div className="flex items-center gap-3 pt-5"><input id="new-active" type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} className="h-4 w-4 accent-rust" /><label htmlFor="new-active" className="text-sm">Visible in the shop</label></div>
        <div className="sm:col-span-2 lg:col-span-4"><button disabled={busy} className={primaryButton}><Icon name={busy ? "loader" : "plus"} className={busy ? "animate-spin" : ""} />{busy ? "Adding…" : "Add product"}</button></div>
      </form>
    </section>
    <section className="rounded-xl border border-line bg-white p-6 sm:p-8">
      <div className="mb-6 flex items-center justify-between"><h2 className="font-serif text-2xl">The catalogue <span className="ml-2 font-sans text-sm text-muted">{products?.total ?? ""}</span></h2><span className="text-xs text-muted">Includes hidden products</span></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left"><thead><tr className="border-b border-line text-[10px] tracking-widest text-muted uppercase"><th className="pb-4 font-medium">Product</th><th className="px-3 pb-4 font-medium">Price</th><th className="px-3 pb-4 font-medium">Stock</th><th className="px-3 pb-4 font-medium">Visibility</th><th className="pb-4 text-right font-medium">Update</th></tr></thead><tbody>{products?.items.map((product) => <ProductRow key={`${product.id}-${version}`} product={product} token={token} onSaved={updated} />)}</tbody></table></div>
      {!products && !error && <p className="py-8 text-center text-sm text-muted">Loading the catalogue…</p>}
      {products && <div className="mt-5 flex items-center justify-between text-sm text-muted"><span>Page {page} of {Math.max(1, Math.ceil(products.total / 10))}</span><div className="flex gap-2"><button aria-label="Previous admin page" disabled={page === 1} onClick={() => setPage((value) => value - 1)} className="rounded border border-line p-2 disabled:opacity-30"><Icon name="chevron-left" className="h-4 w-4" /></button><button aria-label="Next admin page" disabled={page * 10 >= products.total} onClick={() => setPage((value) => value + 1)} className="rounded border border-line p-2 disabled:opacity-30"><Icon name="chevron-right" className="h-4 w-4" /></button></div></div>}
    </section>
  </main>;
}

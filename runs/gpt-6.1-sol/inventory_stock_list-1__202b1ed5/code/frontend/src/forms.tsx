import { useState } from "react";
import type { FormEvent } from "react";
import { ArrowDownLeft, ArrowRight, ArrowUpRight, Box, LoaderCircle, LockKeyhole, Trash2 } from "lucide-react";
import { ApiError, api, errorMessage, number } from "./api";
import type { Item, Movement } from "./api";
import { ErrorNotice, Field, inputClass, Modal, primaryClass, secondaryClass } from "./components";

export function AuthModal({ close, success }: { close: () => void; success: (username: string) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(""); setErrors({});
    try {
      const body = JSON.stringify({ username, password });
      if (mode === "register") await api("/auth/register", { method: "POST", body });
      const result = await api<{ token: string }>("/auth/login", { method: "POST", body });
      localStorage.setItem("stockroom-token", result.token);
      const account = await api<{ username: string }>("/auth/me");
      success(account.username);
    } catch (error) {
      setError(errorMessage(error));
      if (error instanceof ApiError) setErrors(error.errors);
    } finally { setBusy(false); }
  }
  return <Modal close={close} title={mode === "login" ? "Welcome back." : "Make room for better inventory."} subtitle={mode === "login" ? "Sign in to keep your warehouse moving." : "Create your account to start managing stock."}>
    <div className="mb-6 flex rounded-lg bg-[#f3f6f3] p-1">{(["login", "register"] as const).map(value => <button key={value} onClick={() => { setMode(value); setError(""); setErrors({}); }} className={`flex-1 rounded-md py-2 text-sm font-medium transition ${mode === value ? "bg-white text-brand-700 shadow-xs" : "text-[#7a8780]"}`}>{value === "login" ? "Sign in" : "Create account"}</button>)}</div>
    <form onSubmit={submit} className="space-y-5">
      {error && <ErrorNotice message={error} />}
      <Field label="Username" error={errors.username}><input className={inputClass} autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} placeholder="Enter your username" required maxLength={64} /></Field>
      <Field label="Password" error={errors.password}><input className={inputClass} type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={event => setPassword(event.target.value)} placeholder="Enter your password" required maxLength={128} /></Field>
      <button disabled={busy} className={`${primaryClass} w-full`}>{busy ? <LoaderCircle size={17} className="animate-spin" /> : <>{mode === "login" ? "Sign in" : "Create account"}<ArrowRight size={17} /></>}</button>
    </form>
    <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-[#8a958f]"><LockKeyhole size={12} />Your inventory is public. Your account is secure.</p>
  </Modal>;
}

export function ItemForm({ item, locations, close, saved }: { item: Item | "new"; locations: string[]; close: () => void; saved: (item: Item, isNew: boolean) => void }) {
  const isNew = item === "new";
  const [values, setValues] = useState({ name: isNew ? "" : item.name, sku: isNew ? "" : item.sku, location: isNew ? "" : item.location, reorder_level: isNew ? "0" : String(item.reorder_level), quantity: "0" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const change = (field: keyof typeof values, value: string) => setValues(previous => ({ ...previous, [field]: value }));
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setErrors({}); setError("");
    try {
      const result = await api<Item>(isNew ? "/items" : `/items/${item.id}`, {
        method: isNew ? "POST" : "PUT",
        body: JSON.stringify({ name: values.name, sku: values.sku, location: values.location, reorder_level: Number(values.reorder_level), ...(isNew ? { quantity: Number(values.quantity) } : {}) }),
      });
      saved(result, isNew);
    } catch (error) {
      setError(errorMessage(error));
      if (error instanceof ApiError) setErrors(error.errors);
    } finally { setBusy(false); }
  }
  return <Modal close={close} title={isNew ? "Add a new item" : "Edit item"} subtitle={isNew ? "A place for everything. Start with the basics." : "Update the details, without changing your stock."} wide>
    <form onSubmit={submit} className="space-y-5">
      {error && <ErrorNotice message={error} />}
      <Field label="Item name" error={errors.name}><input className={inputClass} value={values.name} onChange={event => change("name", event.target.value)} placeholder="e.g. Heavy-duty work gloves" required maxLength={120} /></Field>
      <div className="grid gap-5 sm:grid-cols-2"><Field label="SKU" error={errors.sku} hint="A unique code for this item."><input className={inputClass} value={values.sku} onChange={event => change("sku", event.target.value)} placeholder="e.g. SFT-013" required maxLength={120} /></Field>
        <Field label="Storage location" error={errors.location}><input className={inputClass} list="warehouse-locations" value={values.location} onChange={event => change("location", event.target.value)} placeholder="e.g. Zone A · Rack 01" required maxLength={120} /><datalist id="warehouse-locations">{locations.map(location => <option key={location} value={location} />)}</datalist></Field></div>
      <div className="grid gap-5 sm:grid-cols-2">{isNew ? <Field label="Opening quantity" error={errors.quantity} hint="The number of units currently in stock."><input className={inputClass} type="number" min="0" max="2147483647" step="1" required value={values.quantity} onChange={event => change("quantity", event.target.value)} /></Field> : <div><p className="mb-2 text-sm font-medium text-[#415149]">Current quantity</p><div className="flex items-center gap-2 rounded-lg border border-[#e8ece8] bg-[#f5f7f5] px-3.5 py-2.5 text-sm text-[#7a8780]"><Box size={16} />{number(item.quantity)} units<LockKeyhole size={13} className="ml-auto" /></div><p className="mt-1.5 text-xs text-[#8a958f]">Adjust stock with a receive or take-out movement.</p></div>}
        <Field label="Reorder level" error={errors.reorder_level} hint="Flag the item at or below this quantity."><input className={inputClass} type="number" min="0" max="2147483647" step="1" required value={values.reorder_level} onChange={event => change("reorder_level", event.target.value)} /></Field></div>
      <div className="flex justify-end gap-3 border-t border-[#edf0ee] pt-5"><button type="button" onClick={close} className={secondaryClass}>Cancel</button><button disabled={busy} className={primaryClass}>{busy && <LoaderCircle size={16} className="animate-spin" />}{isNew ? "Add item" : "Save changes"}</button></div>
    </form>
  </Modal>;
}

export function DeleteModal({ item, close, deleted }: { item: Item; close: () => void; deleted: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function remove() {
    setBusy(true); setError("");
    try { await api(`/items/${item.id}`, { method: "DELETE" }); deleted(); }
    catch (error) { setError(errorMessage(error)); }
    finally { setBusy(false); }
  }
  return <Modal close={close} title="Delete this item?" subtitle="This action cannot be undone.">
    <div className="mb-5 flex items-center gap-3 rounded-lg bg-[#f6f8f6] p-4"><span className="rounded-lg bg-white p-2.5 text-[#78877e]"><Box size={22} /></span><div><p className="text-sm font-semibold text-ink">{item.name}</p><p className="mt-1 text-xs text-[#8a958f]">{item.sku} · {number(item.quantity)} units</p></div></div>
    <p className="mb-5 text-sm leading-6 text-[#6e7d74]">The item and its entire movement history will be permanently removed from your warehouse.</p>
    {error && <ErrorNotice message={error} />}
    <div className="mt-6 flex justify-end gap-3"><button className={secondaryClass} onClick={close}>Keep item</button><button disabled={busy} onClick={remove} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">{busy ? <LoaderCircle size={16} className="animate-spin" /> : <Trash2 size={16} />}Delete item</button></div>
  </Modal>;
}

export function MovementForm({ item, direction, signedIn, authenticate, saved }: { item: Item; direction: "receive" | "take"; signedIn: boolean; authenticate: () => void; saved: (movement: Movement) => void }) {
  const receive = direction === "receive";
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!signedIn) { authenticate(); return; }
    setBusy(true); setError("");
    try {
      const result = await api<Movement>(`/items/${item.id}/movements`, { method: "POST", body: JSON.stringify({ delta: Number(quantity) * (receive ? 1 : -1), reason }) });
      setQuantity(""); setReason(""); saved(result);
    } catch (error) { setError(errorMessage(error)); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="rounded-xl border border-[#e0e6e0] bg-white p-5">
    <div className="mb-5 flex items-center gap-2.5"><span className={`rounded-lg p-2 ${receive ? "bg-brand-50 text-brand-600" : "bg-[#fff5e4] text-[#b28336]"}`}>{receive ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}</span><div><h3 className="text-sm font-semibold text-ink">{receive ? "Receive stock" : "Take out stock"}</h3><p className="mt-0.5 text-xs text-[#8a958f]">{receive ? "Record units arriving at your warehouse." : "Record units leaving your warehouse."}</p></div></div>
    <div className="space-y-4">{error && <ErrorNotice message={error} />}<Field label="Quantity"><input className={inputClass} type="number" min="1" max="2147483647" step="1" value={quantity} onChange={event => setQuantity(event.target.value)} placeholder="Number of units" required /></Field><Field label="Reason"><input className={inputClass} value={reason} onChange={event => setReason(event.target.value)} maxLength={500} placeholder={receive ? "e.g. Supplier delivery" : "e.g. Customer order #1024"} required /></Field>
      {signedIn ? <button disabled={busy} className={`${receive ? primaryClass : secondaryClass} w-full`}>{busy ? <LoaderCircle size={16} className="animate-spin" /> : receive ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}{receive ? "Receive stock" : "Take out stock"}</button> : <button type="button" onClick={authenticate} className={`${secondaryClass} w-full`}><LockKeyhole size={14} />Sign in to record stock</button>}</div>
  </form>;
}

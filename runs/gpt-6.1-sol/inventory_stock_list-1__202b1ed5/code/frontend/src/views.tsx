import { useEffect, useState } from "react";
import { Activity, ArrowDownLeft, ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpDown, ArrowUpRight, Box, ChevronDown, ChevronRight, CircleHelp, ClipboardList, MapPin, MoreHorizontal, Package, Pencil, Search, ShieldCheck, SlidersHorizontal, Trash2, Warehouse, Wrench, X, Zap } from "lucide-react";
import type { Item, Movement, Overview, Page } from "./api";
import { api, errorMessage, number } from "./api";
import { ErrorNotice, inputClass, Loading, Pagination, primaryClass, secondaryClass, Status } from "./components";
import { MovementForm } from "./forms";

type Actions = { view: (item: Item) => void; edit: (item: Item) => void; remove: (item: Item) => void };
export type Filters = { q: string; location: string; lowStock: boolean };

function category(sku: string) {
  if (sku.startsWith("TLS")) return { title: "Tools & equipment", Icon: Wrench, style: "bg-[#eef3f7] text-[#718699]" };
  if (sku.startsWith("SFT")) return { title: "Safety essentials", Icon: ShieldCheck, style: "bg-[#f1f0f7] text-[#8a7da3]" };
  if (sku.startsWith("ELC")) return { title: "Electrical supplies", Icon: Zap, style: "bg-[#fff6e7] text-[#b69865]" };
  if (sku.startsWith("FST")) return { title: "Hardware & fasteners", Icon: SlidersHorizontal, style: "bg-[#eef3f7] text-[#7d8b9b]" };
  return { title: sku.startsWith("PKG") ? "Packaging & supplies" : "Inventory item", Icon: Package, style: "bg-[#f4f1eb] text-[#a49173]" };
}

function ItemIcon({ item, large = false }: { item: Item; large?: boolean }) {
  const { Icon, style } = category(item.sku);
  return <span className={`flex shrink-0 items-center justify-center rounded-lg ${large ? "h-16 w-16 rounded-2xl" : "h-9 w-9"} ${style}`}><Icon size={large ? 30 : 18} strokeWidth={1.6} /></span>;
}

function saveCsv(items: Item[]) {
  const columns: (keyof Item)[] = ["name", "sku", "location", "quantity", "reorder_level", "low_stock"];
  const escape = (value: unknown) => {
    let text = String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  const data = [columns.map(escape).join(","), ...items.map(item => columns.map(column => escape(item[column])).join(","))].join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF" + data], { type: "text/csv;charset=utf-8;" }));
  const link = document.createElement("a");
  link.href = url; link.download = `stockroom-inventory-${new Date().toISOString().slice(0, 10)}.csv`; link.click();
  URL.revokeObjectURL(url);
}

export function Inventory({ overview, filters, setFilters, revision, actions, add, notify }: { overview: Overview; filters: Filters; setFilters: (filters: Filters) => void; revision: number; actions: Actions; add: () => void; notify: (message: string) => void }) {
  const [data, setData] = useState<Page<Item>>({ items: [], total: 0, page: 1, page_size: 10 });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [query, setQuery] = useState(filters.q);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [menu, setMenu] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { const timer = setTimeout(() => { setQuery(filters.q); setPage(1); }, 250); return () => clearTimeout(timer); }, [filters.q]);
  useEffect(() => { setPage(1); }, [filters.location, filters.lowStock, pageSize]);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(""); setSelected(new Set()); setMenu(null);
    const params = new URLSearchParams({ q: query, location: filters.location, low_stock: String(filters.lowStock), page: String(page), page_size: String(pageSize) });
    api<Page<Item>>(`/items?${params}`).then(result => {
      if (!active) return;
      if (page > 1 && !result.items.length && result.total) { setPage(Math.max(1, Math.ceil(result.total / pageSize))); return; }
      if (page > 1 && !result.total) { setPage(1); return; }
      setData(result);
    }).catch(error => { if (active) setError(errorMessage(error)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [query, filters.location, filters.lowStock, page, pageSize, revision, attempt]);
  useEffect(() => {
    if (menu === null) return;
    const handler = (event: MouseEvent) => { if (!(event.target as HTMLElement).closest("[data-item-menu]")) setMenu(null); };
    const keyboard = (event: KeyboardEvent) => { if (event.key === "Escape") setMenu(null); };
    document.addEventListener("click", handler); document.addEventListener("keydown", keyboard);
    return () => { document.removeEventListener("click", handler); document.removeEventListener("keydown", keyboard); };
  }, [menu]);
  async function exportItems() {
    setExporting(true);
    try {
      if (selected.size) saveCsv(data.items.filter(item => selected.has(item.id)));
      else {
        const items: Item[] = [];
        let exportPage = 1;
        let total = 1;
        while (items.length < total) {
          const params = new URLSearchParams({ q: query, location: filters.location, low_stock: String(filters.lowStock), page: String(exportPage), page_size: "100" });
          const result = await api<Page<Item>>(`/items?${params}`);
          total = result.total; items.push(...result.items); exportPage++;
          if (!result.items.length) break;
        }
        saveCsv(items);
      }
      notify("Your inventory export is ready.");
    } catch (error) { setError(errorMessage(error)); }
    finally { setExporting(false); }
  }
  const reset = () => setFilters({ q: "", location: "", lowStock: false });
  return <>
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-[29px] font-semibold tracking-[-1px] text-ink">Inventory</h1><p className="mt-1.5 text-sm text-[#7a8780]">Everything in stock. Everything in sight.</p></div><div className="mt-1 flex gap-2.5"><button disabled={exporting} onClick={exportItems} className={secondaryClass}><ArrowDownToLine size={16} />{exporting ? "Exporting…" : selected.size ? `Export ${selected.size} selected` : "Export"}</button><button onClick={add} className={primaryClass}><span className="text-xl font-normal leading-4">+</span>Add item</button></div></div>
    <Stats overview={overview} />
    {overview.low_stock > 0 && <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#f0e7cd] bg-[#fffbf0] px-5 py-4"><div className="flex items-center gap-3.5"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#fff1ca] text-[#b28837]"><Box size={19} strokeWidth={1.7} /></span><div><p className="text-[13px] font-semibold text-[#816729]">A little attention goes a long way.</p><p className="mt-1 text-xs text-[#9e8b59]">{overview.low_stock} {overview.low_stock === 1 ? "item is" : "items are"} at or below the reorder level. Time to restock.</p></div></div><button onClick={() => setFilters({ q: "", location: "", lowStock: true })} className="inline-flex items-center gap-2 whitespace-nowrap text-xs font-semibold text-[#9b7a30] hover:text-[#6f551e]">View low-stock items<ArrowRight size={15} /></button></div>}
    <section className="rounded-xl border border-[#e0e6e0] bg-white shadow-[0_2px_3px_0_#223b2810]">
      <div className="flex items-center justify-between px-5 pt-5"><div className="flex items-center gap-2.5"><h2 className="text-[15px] font-semibold text-ink">All inventory</h2><span className="rounded-md bg-[#f2f5f2] px-2 py-0.5 text-[10px] font-medium text-[#7d8a80]">{number(data.total)} items</span></div><span className="hidden items-center gap-1.5 text-[11px] text-[#98a29b] sm:flex"><span className="h-1.5 w-1.5 rounded-full bg-brand-500" />Live inventory</span></div>
      <div className="flex flex-wrap items-center gap-3 px-5 py-4"><div className="relative min-w-44 flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#96a299]" size={16} /><input aria-label="Search inventory" className={`${inputClass} py-2.5 pl-9 text-xs`} placeholder="Search by item name or SKU…" value={filters.q} onChange={event => setFilters({ ...filters, q: event.target.value })} />{filters.q && <button onClick={() => setFilters({ ...filters, q: "" })} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400"><X size={13} /></button>}</div>
        <div className="relative w-52"><MapPin size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8b988f]" /><select aria-label="Filter by location" className={`${inputClass} appearance-none py-2.5 pl-8 pr-7 text-xs`} value={filters.location} onChange={event => setFilters({ ...filters, location: event.target.value })}><option value="">All locations</option>{overview.locations.map(({ location }) => <option key={location} value={location}>{location}</option>)}</select><ChevronDown size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#8b988f]" /></div>
        <div className="ml-auto flex items-center gap-2.5 pl-1"><button role="switch" aria-checked={filters.lowStock} aria-label="Low stock only" onClick={() => setFilters({ ...filters, lowStock: !filters.lowStock })} className={`relative h-[18px] w-8 rounded-full transition ${filters.lowStock ? "bg-brand-600" : "bg-[#dce3dd]"}`}><span className={`absolute top-[3px] h-3 w-3 rounded-full bg-white shadow-xs transition ${filters.lowStock ? "left-[17px]" : "left-[3px]"}`} /></button><span className="whitespace-nowrap text-xs text-[#68786e]">Low stock only</span></div>
      </div>
      {error ? <div className="p-5"><ErrorNotice message={error} /><button onClick={() => setAttempt(value => value + 1)} className={`${secondaryClass} mt-4`}>Try again</button></div> : loading ? <Loading /> : !data.items.length ? <div className="flex min-h-80 flex-col items-center justify-center px-5 text-center"><span className="mb-4 rounded-2xl bg-brand-50 p-5 text-brand-600"><Package size={30} strokeWidth={1.5} /></span><h3 className="text-lg font-semibold text-ink">{overview.total_items ? "No items found" : "Your warehouse starts here."}</h3><p className="mt-2 max-w-sm text-sm leading-6 text-[#8a958f]">{overview.total_items ? "Try a different search or adjust your filters to find what you need." : "Add your first item and get a clearer view of everything you have in stock."}</p><button className={`${overview.total_items ? secondaryClass : primaryClass} mt-5`} onClick={overview.total_items ? reset : add}>{overview.total_items ? "Clear filters" : "+ Add your first item"}</button></div> : <div className="overflow-x-auto"><table className="w-full min-w-[850px] border-collapse text-left"><thead><tr className="border-y border-[#e9ede9] bg-[#f8faf8] text-[10px] font-medium uppercase tracking-[0.65px] text-[#829086]"><th className="w-10 py-3 pl-5 pr-3"><input aria-label="Select all items on this page" type="checkbox" className="h-3.5 w-3.5 cursor-pointer accent-brand-600" checked={data.items.length > 0 && selected.size === data.items.length} onChange={event => setSelected(event.target.checked ? new Set(data.items.map(item => item.id)) : new Set())} /></th><th className="py-3 pr-4 font-medium"><span className="flex items-center gap-2">Item name<ArrowUpDown size={11} /></span></th><th className="py-3 pr-5 font-medium">SKU</th><th className="py-3 pr-5 font-medium">Location</th><th className="py-3 pr-6 text-right font-medium">In stock</th><th className="py-3 pr-6 text-right font-medium">Reorder level</th><th className="py-3 pr-5 font-medium">Status</th><th className="w-10 pr-4"><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>{data.items.map((item, index) => <tr key={item.id} className={`group border-b border-[#edf0ec] last:border-b-0 ${selected.has(item.id) ? "bg-brand-50/70" : item.low_stock ? "bg-[#fffcf4] hover:bg-[#fff9e9]" : "hover:bg-[#fafcf9]"}`}>
          <td className={`relative py-4 pl-5 pr-3 ${item.low_stock ? "before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[#ebcd87]" : ""}`}><input type="checkbox" aria-label={`Select ${item.name}`} className="h-3.5 w-3.5 cursor-pointer accent-brand-600" checked={selected.has(item.id)} onChange={event => { const next = new Set(selected); if (event.target.checked) next.add(item.id); else next.delete(item.id); setSelected(next); }} /></td>
          <td className="py-3.5 pr-4"><button onClick={() => actions.view(item)} className="flex items-center gap-3 text-left"><ItemIcon item={item} /><span><span className="block whitespace-nowrap text-xs font-semibold text-[#35463c] transition hover:text-brand-600">{item.name}</span><span className="mt-1 block text-[10px] text-[#94a096]">{category(item.sku).title}</span></span></button></td>
          <td className="pr-5 font-mono text-[11px] text-[#839085]">{item.sku}</td><td className="pr-5"><span className="flex items-center gap-1.5 whitespace-nowrap text-[11px] text-[#7a887d]"><MapPin size={12} className="text-[#a0aaa1]" />{item.location}</span></td><td className={`pr-6 text-right text-[13px] font-semibold ${item.low_stock ? "text-[#b08432]" : "text-[#3b4d40]"}`}>{number(item.quantity)}<span className="ml-1 text-[9px] font-normal text-[#a0aaa1]">units</span></td><td className="pr-6 text-right text-xs text-[#859187]">{number(item.reorder_level)}</td><td className="pr-3"><Status item={item} /></td>
          <td className="relative pr-3" data-item-menu><button aria-label={`Actions for ${item.name}`} aria-expanded={menu === item.id} onClick={() => setMenu(menu === item.id ? null : item.id)} className="rounded-md p-1.5 text-[#94a096] hover:bg-[#eef2ec] hover:text-[#4b5a53]"><MoreHorizontal size={17} /></button>{menu === item.id && <div className={`absolute right-6 z-20 w-40 rounded-lg border border-[#e0e6e0] bg-white p-1.5 shadow-lg ${index > data.items.length / 2 ? "bottom-8" : "top-10"}`}>{[{ label: "View item", Icon: Box, action: actions.view }, { label: "Edit item", Icon: Pencil, action: actions.edit }, { label: "Delete item", Icon: Trash2, action: actions.remove }].map(({ label, Icon, action }) => <button key={label} onClick={() => { setMenu(null); action(item); }} className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-xs hover:bg-gray-50 ${label === "Delete item" ? "text-red-500" : "text-[#5f7064]"}`}><Icon size={13} />{label}</button>)}</div>}</td>
        </tr>)}</tbody></table></div>}
      <Pagination page={page} pageSize={pageSize} total={data.total} setPage={setPage} setPageSize={setPageSize} />
    </section>
    <div className="mt-6 grid gap-5 lg:grid-cols-[1.2fr_1fr]"><div className="flex items-center gap-4 rounded-xl border border-[#e2e8e0] bg-white px-5 py-4"><span className="rounded-xl bg-brand-50 p-3 text-brand-600"><ClipboardList size={22} strokeWidth={1.5} /></span><div><h3 className="text-xs font-semibold text-[#435748]">Every movement tells a story.</h3><p className="mt-1.5 text-[11px] leading-5 text-[#8b988d]">Open an item to receive stock, take out units, and see its full history.</p></div><CircleHelp size={16} className="ml-auto shrink-0 text-[#a5afa4]" /></div><StockHealth overview={overview} /></div>
  </>;
}

export function Stats({ overview }: { overview: Overview }) {
  const stats = [
    { label: "Total items", value: overview.total_items, caption: "Unique items in your warehouse", Icon: Package, style: "bg-brand-50 text-brand-600" },
    { label: "Total units", value: overview.total_units, caption: "Units across all locations", Icon: Box, style: "bg-[#eef4fa] text-[#6a91b5]" },
    { label: "Low-stock items", value: overview.low_stock, caption: "Items that need your attention", Icon: Activity, style: "bg-[#fff6e4] text-[#b58a3c]" },
    { label: "Storage locations", value: overview.locations.length, caption: "Organized and easy to find", Icon: MapPin, style: "bg-[#f3f0fa] text-[#9a85b8]" },
  ];
  return <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4 xl:gap-4">{stats.map(({ label, value, caption, Icon, style }) => <div key={label} className="rounded-xl border border-[#e1e7e0] bg-white px-5 py-5 shadow-[0_2px_3px_0_#223b2808]"><div className="flex items-center justify-between"><span className="text-xs font-medium text-[#7c8980]">{label}</span><span className={`flex h-8 w-8 items-center justify-center rounded-lg ${style}`}><Icon size={17} strokeWidth={1.7} /></span></div><p className="mt-2 text-[28px] font-semibold tracking-[-1px] text-[#304639]">{number(value)}</p><p className="mt-1 text-[10px] text-[#96a194]">{caption}</p></div>)}</div>;
}

function StockHealth({ overview }: { overview: Overview }) {
  const healthy = overview.total_items - overview.low_stock;
  const percentage = overview.total_items ? Math.round(healthy / overview.total_items * 100) : 0;
  return <div className="rounded-xl border border-[#e2e8e0] bg-white px-5 py-4"><div className="flex items-center justify-between"><h3 className="text-xs font-semibold text-[#435748]">Stock health</h3><span className="text-[10px] text-[#8b988d]"><span className="font-semibold text-brand-600">{percentage}%</span> well stocked</span></div><div className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-[#f0f3ed]"><div className="h-full bg-[#5b9a7b]" style={{ width: `${percentage}%` }} /><div className="h-full flex-1 bg-[#ecd29a]" /></div><div className="mt-2.5 flex gap-4 text-[10px] text-[#8b988d]"><span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-[#5b9a7b]" />{healthy} in stock</span><span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-[#ecd29a]" />{overview.low_stock} low stock</span></div></div>;
}

function MovementTable({ movements, showItem, navigate }: { movements: Movement[]; showItem?: boolean; navigate?: (path: string) => void }) {
  return <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left"><thead className="border-y border-[#e9ede9] bg-[#f8faf8] text-[10px] uppercase tracking-wider text-[#829086]"><tr>{["Movement", ...(showItem ? ["Item"] : []), "Reason", "Stock after", "Recorded by", "Date & time"].map(label => <th key={label} className="px-5 py-3 font-medium">{label}</th>)}</tr></thead><tbody>{movements.map(movement => <tr key={movement.id} className="border-b border-[#edf0ec] last:border-b-0"><td className="px-5 py-4"><span className={`flex items-center gap-2 text-xs font-semibold ${movement.delta > 0 ? "text-brand-600" : "text-[#b08432]"}`}><span className={`rounded-md p-1.5 ${movement.delta > 0 ? "bg-brand-50" : "bg-[#fff6e4]"}`}>{movement.delta > 0 ? <ArrowDownLeft size={15} /> : <ArrowUpRight size={15} />}</span>{movement.delta > 0 ? "+" : ""}{number(movement.delta)}<span className="font-normal text-[#96a194]">units</span></span></td>{showItem && <td className="px-5 py-4"><button className="text-left" onClick={() => navigate?.(`/items/${movement.item_id}`)}><span className="block text-xs font-semibold text-[#435748] hover:text-brand-600">{movement.name}</span><span className="mt-1 block font-mono text-[10px] text-[#96a194]">{movement.sku}</span></button></td>}<td className="max-w-64 break-words px-5 py-4 text-xs leading-5 text-[#7c8980]">{movement.reason}</td><td className="px-5 py-4 text-xs font-medium text-[#435748]">{number(movement.quantity_after)}</td><td className="px-5 py-4"><span className="flex items-center gap-2 text-xs text-[#7c8980]"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#f0f3ed] text-[9px] font-medium text-[#6e8a72]">{movement.username.slice(0, 2).toUpperCase()}</span>{movement.username}</span></td><td className="whitespace-nowrap px-5 py-4 text-[11px] text-[#8b988d]"><span className="block">{new Date(movement.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span><span className="mt-1 block text-[10px] text-[#a1aba0]">{new Date(movement.created_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span></td></tr>)}</tbody></table></div>;
}

export function ItemDetail({ id, revision, actions, signedIn, authenticate, changed, back }: { id: number; revision: number; actions: Actions; signedIn: boolean; authenticate: () => void; changed: (message: string) => void; back: () => void }) {
  const [item, setItem] = useState<Item | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setError("");
    Promise.all([api<Item>(`/items/${id}`), api<{ items: Movement[] }>(`/items/${id}/movements`)]).then(([item, history]) => { if (active) { setItem(item); setMovements(history.items); } }).catch(error => { if (active) setError(errorMessage(error)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, revision]);
  if (loading) return <Loading />;
  if (error) return <><button onClick={back} className={`${secondaryClass} mb-5`}><ArrowLeft size={15} />Back to inventory</button><ErrorNotice message={error} /></>;
  if (!item) return null;
  return <><button onClick={back} className="mb-6 flex items-center gap-2 text-xs font-medium text-[#7c8980] hover:text-brand-600"><ArrowLeft size={14} />Back to inventory</button>
    <div className="mb-7 flex flex-wrap items-center justify-between gap-5"><div className="flex items-center gap-4"><ItemIcon item={item} large /><div><div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-semibold tracking-tight text-ink">{item.name}</h1><Status item={item} /></div><p className="mt-2 flex items-center gap-2 text-xs text-[#8b988d]"><span className="font-mono">{item.sku}</span><span className="mx-1 text-gray-300">/</span><MapPin size={13} />{item.location}</p></div></div><div className="flex gap-2"><button onClick={() => actions.edit(item)} className={secondaryClass}><Pencil size={15} />Edit item</button><button onClick={() => actions.remove(item)} aria-label="Delete item" className={`${secondaryClass} px-3 hover:text-red-500`}><Trash2 size={16} /></button></div></div>
    <div className="mb-6 grid gap-4 sm:grid-cols-3"><div className="rounded-xl border border-brand-100 bg-brand-50/60 p-5"><p className="text-xs text-brand-700">Current stock</p><p className="mt-3 text-4xl font-semibold tracking-tight text-brand-700">{number(item.quantity)}<span className="ml-2 text-sm font-normal text-[#719e8f]">units</span></p></div><div className="rounded-xl border border-[#e0e6e0] bg-white p-5"><p className="text-xs text-[#8b988d]">Reorder level</p><p className="mt-3 text-4xl font-semibold tracking-tight text-[#435748]">{number(item.reorder_level)}<span className="ml-2 text-sm font-normal text-[#8b988d]">units</span></p></div><div className="rounded-xl border border-[#e0e6e0] bg-white p-5"><p className="text-xs text-[#8b988d]">Recorded movements</p><p className="mt-3 text-4xl font-semibold tracking-tight text-[#435748]">{number(movements.length)}<span className="ml-2 text-sm font-normal text-[#8b988d]">movements</span></p></div></div>
    {item.low_stock && <div className="mb-6 flex items-center gap-2 rounded-lg border border-[#f0e7cd] bg-[#fffbf0] px-4 py-3 text-xs text-[#9b7a30]"><Box size={16} />This item is at or below its reorder level. Receive new stock to keep things moving.</div>}
    <div className="mb-6 grid gap-5 md:grid-cols-2">{(["receive", "take"] as const).map(direction => <MovementForm key={`${id}-${direction}`} item={item} direction={direction} signedIn={signedIn} authenticate={authenticate} saved={movement => { setItem(previous => previous ? { ...previous, quantity: movement.quantity_after, low_stock: movement.quantity_after <= previous.reorder_level } : previous); setMovements(previous => [movement, ...previous]); changed(direction === "receive" ? "Stock received. Inventory updated." : "Stock taken out. Inventory updated."); }} />)}</div>
    <section className="rounded-xl border border-[#e0e6e0] bg-white"><div className="flex items-center gap-2.5 px-5 py-5"><h2 className="text-sm font-semibold text-ink">Movement history</h2><span className="rounded-md bg-[#f2f5f2] px-2 py-0.5 text-[10px] text-[#7d8a80]">{movements.length}</span><span className="ml-auto text-[10px] text-[#96a194]">Newest first</span></div>{movements.length ? <MovementTable movements={movements} /> : <EmptyHistory />}</section>
  </>;
}

function EmptyHistory() {
  return <div className="flex min-h-56 flex-col items-center justify-center border-t border-[#edf0ec] px-6 text-center"><span className="mb-3 rounded-xl bg-[#f2f5f0] p-3 text-[#8b9d8a]"><ArrowUpDown size={23} strokeWidth={1.5} /></span><h3 className="text-sm font-semibold text-[#435748]">A fresh start. No movements yet.</h3><p className="mt-2 text-xs text-[#8b988d]">Stock received and taken out will appear here, with a full record of who, when, and why.</p></div>;
}

export function ActivityView({ revision, navigate }: { revision: number; navigate: (path: string) => void }) {
  const [data, setData] = useState<Page<Movement>>({ items: [], total: 0, page: 1, page_size: 10 });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    api<Page<Movement>>(`/activity?page=${page}&page_size=${pageSize}`).then(result => { if (active) setData(result); }).catch(error => { if (active) setError(errorMessage(error)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [revision, page, pageSize]);
  return <><div className="mb-7"><h1 className="text-[29px] font-semibold tracking-[-1px] text-ink">Stock movements</h1><p className="mt-1.5 text-sm text-[#7a8780]">Every unit in. Every unit out. All in one place.</p></div><div className="mb-6 flex items-center gap-3 rounded-xl border border-brand-100 bg-brand-50/60 px-5 py-4"><ClipboardList size={20} className="text-brand-600" /><p className="text-xs leading-5 text-[#658475]">Your warehouse activity, automatically recorded. Open an item from inventory to receive or take out stock.</p><button onClick={() => navigate("/")} className="ml-auto inline-flex items-center gap-2 whitespace-nowrap text-xs font-semibold text-brand-700">Go to inventory<ArrowRight size={14} /></button></div><section className="rounded-xl border border-[#e0e6e0] bg-white"><div className="flex items-center justify-between px-5 py-5"><h2 className="text-sm font-semibold text-ink">All movements <span className="ml-2 rounded-md bg-[#f2f5f2] px-2 py-0.5 text-[10px] font-normal text-[#7d8a80]">{data.total}</span></h2><span className="text-[10px] text-[#96a194]">Newest first</span></div>{error ? <div className="p-5"><ErrorNotice message={error} /></div> : loading ? <Loading text="Loading stock movements…" /> : data.items.length ? <MovementTable movements={data.items} showItem navigate={navigate} /> : <EmptyHistory />}<Pagination page={page} pageSize={pageSize} total={data.total} setPage={setPage} setPageSize={size => { setPageSize(size); setPage(1); }} /></section></>;
}

export function LocationsView({ overview, select }: { overview: Overview; select: (location: string) => void }) {
  return <><div className="mb-7"><h1 className="text-[29px] font-semibold tracking-[-1px] text-ink">Storage locations</h1><p className="mt-1.5 text-sm text-[#7a8780]">A place for everything. Find exactly where it belongs.</p></div><Stats overview={overview} /><div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{overview.locations.map(location => <button key={location.location} onClick={() => select(location.location)} className="group rounded-xl border border-[#e0e6e0] bg-white p-6 text-left transition hover:border-brand-200 hover:shadow-md"><div className="flex items-center justify-between"><span className="rounded-xl bg-brand-50 p-3 text-brand-600"><Warehouse size={24} strokeWidth={1.5} /></span><ChevronRight size={18} className="text-[#a1aba0] transition group-hover:translate-x-1 group-hover:text-brand-600" /></div><h2 className="mt-5 text-base font-semibold text-[#435748]">{location.location}</h2><div className="mt-4 flex gap-6 border-t border-[#edf0ec] pt-4"><div><p className="text-xl font-semibold text-[#435748]">{number(location.item_count)}</p><p className="mt-1 text-[10px] text-[#96a194]">Unique items</p></div><div><p className="text-xl font-semibold text-[#435748]">{number(location.total_units)}</p><p className="mt-1 text-[10px] text-[#96a194]">Total units</p></div></div><p className={`mt-5 inline-flex items-center gap-1.5 text-[10px] ${location.low_stock ? "text-[#b08432]" : "text-[#5b9a7b]"}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{location.low_stock ? `${location.low_stock} low-stock ${location.low_stock === 1 ? "item" : "items"}` : "All items well stocked"}</p></button>)}</div>{!overview.locations.length && <div className="rounded-xl border border-[#e0e6e0] bg-white p-12 text-center"><MapPin className="mx-auto mb-4 text-brand-600" size={30} /><h2 className="text-lg font-semibold text-ink">Give your items a home.</h2><p className="mt-2 text-sm text-[#8b988d]">Storage locations appear here as you add items to your warehouse.</p><button className={`${primaryClass} mt-5`} onClick={() => select("")}>Go to inventory<ArrowRight size={15} /></button></div>}</>;
}

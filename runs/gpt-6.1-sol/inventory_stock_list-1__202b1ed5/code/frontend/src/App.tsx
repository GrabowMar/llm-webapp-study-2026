import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, ArrowRight, BookOpen, CalendarDays, ChevronDown, ChevronRight, CircleHelp, Layers3, LayoutGrid, LogIn, LogOut, MapPin, Menu, Package, ShieldCheck, UserRound, Warehouse } from "lucide-react";
import type { Item, Overview } from "./api";
import { api, errorMessage } from "./api";
import { ErrorNotice, Loading, Modal, primaryClass, secondaryClass, Toast } from "./components";
import { AuthModal, DeleteModal, ItemForm } from "./forms";
import { ActivityView, Inventory, ItemDetail, LocationsView } from "./views";
import type { Filters } from "./views";

const emptyOverview: Overview = { total_items: 0, total_units: 0, low_stock: 0, locations: [] };

function useRoute() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const update = () => setPath(window.location.pathname);
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  const navigate = useCallback((path: string) => {
    if (window.location.pathname !== path) window.history.pushState({}, "", path);
    setPath(path);
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);
  return { path, navigate };
}

export default function App() {
  const { path, navigate } = useRoute();
  const [overview, setOverview] = useState<Overview>(emptyOverview);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [revision, setRevision] = useState(0);
  const [username, setUsername] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [itemForm, setItemForm] = useState<Item | "new" | null>(null);
  const [deleteItem, setDeleteItem] = useState<Item | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [filters, setFilters] = useState<Filters>({ q: "", location: "", lowStock: false });
  const afterAuth = useRef<(() => void) | null>(null);
  const itemMatch = path.match(/^\/items\/(\d+)\/?$/);
  const section = path === "/activity" ? "activity" : path === "/locations" ? "locations" : "inventory";
  const title = section === "activity" ? "Stock movements" : section === "locations" ? "Storage locations" : "Inventory";
  useEffect(() => {
    let active = true;
    setLoadError("");
    api<Overview>("/overview").then(result => { if (active) setOverview(result); }).catch(error => { if (active) setLoadError(errorMessage(error)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [revision]);
  useEffect(() => {
    if (!localStorage.getItem("stockroom-token")) return;
    api<{ username: string }>("/auth/me").then(account => setUsername(account.username)).catch(() => localStorage.removeItem("stockroom-token"));
  }, []);
  useEffect(() => { document.title = `${title} · Stockroom`; }, [title]);
  const dismissToast = useCallback(() => setToast(""), []);
  const change = (message: string) => { setRevision(value => value + 1); setToast(message); };
  const requireAuth = (action?: () => void) => {
    if (username) action?.();
    else { afterAuth.current = action || null; setAuthOpen(true); }
  };
  const go = (route: string) => { navigate(route); setSidebarOpen(false); };
  async function signOut() {
    try { await api("/auth/logout", { method: "POST" }); } catch { localStorage.removeItem("stockroom-token"); }
    localStorage.removeItem("stockroom-token"); setUsername(null); setItemForm(null); setDeleteItem(null); setToast("You’re signed out. Your inventory is still here.");
  }
  const actions = {
    view: (item: Item) => navigate(`/items/${item.id}`),
    edit: (item: Item) => requireAuth(() => setItemForm(item)),
    remove: (item: Item) => requireAuth(() => setDeleteItem(item)),
  };
  return <div className="min-h-screen bg-[#f6f8f5] font-sans text-ink antialiased [&_button]:cursor-pointer [&_button:disabled]:cursor-not-allowed">
    {sidebarOpen && <div className="fixed inset-0 z-30 bg-[#142a24]/35 backdrop-blur-[2px] lg:hidden" onClick={() => setSidebarOpen(false)} />}
    <aside className={`fixed inset-y-0 left-0 z-40 flex w-[232px] flex-col border-r border-[#e3e8e0] bg-white transition-transform lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
      <button onClick={() => go("/")} className="flex items-center gap-2.5 px-6 pb-7 pt-8 text-left"><span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-brand-600 text-white shadow-[0_3px_7px_#087f7320]"><Layers3 size={23} strokeWidth={1.6} /></span><span className="text-[21px] font-semibold tracking-[-0.7px] text-[#274736]">stockroom<span className="text-brand-600">.</span></span></button>
      <div className="mx-5 mb-7 flex items-center gap-2.5 rounded-lg border border-[#e7ece5] bg-[#fafbf9] px-3 py-3"><span className="flex h-7 w-7 items-center justify-center rounded-md border border-[#e1e7dc] bg-white text-[#73876f]"><Warehouse size={15} strokeWidth={1.6} /></span><div><p className="text-[11px] font-semibold text-[#52694f]">Main warehouse</p><p className="mt-0.5 text-[9px] text-[#98a292]">Your workspace</p></div><span className="ml-auto h-1.5 w-1.5 rounded-full bg-brand-500" /></div>
      <p className="mb-3 px-7 text-[9px] font-medium uppercase tracking-[1.5px] text-[#a2ad9e]">Workspace</p>
      <nav className="space-y-1.5 px-4">{[{ key: "inventory", label: "Inventory", route: "/", Icon: LayoutGrid }, { key: "activity", label: "Stock movements", route: "/activity", Icon: ArrowRight }, { key: "locations", label: "Locations", route: "/locations", Icon: MapPin }].map(({ key, label, route, Icon }) => <button key={key} onClick={() => go(route)} aria-current={section === key ? "page" : undefined} className={`flex w-full items-center gap-3 rounded-lg px-3.5 py-3 text-[12px] font-medium transition ${section === key ? "bg-brand-50 text-brand-700" : "text-[#82907d] hover:bg-[#f7f9f5] hover:text-[#536b4f]"}`}><Icon size={17} strokeWidth={1.6} className={key === "activity" ? "rotate-[-35deg]" : ""} />{label}{key === "inventory" && <span className={`ml-auto min-w-5 rounded px-1.5 py-0.5 text-center text-[9px] ${section === key ? "bg-brand-100 text-brand-700" : "bg-[#f2f5f0]"}`}>{overview.total_items}</span>}</button>)}</nav>
      <div className="mt-auto px-5 pb-6 pt-12"><div className="relative overflow-hidden rounded-xl border border-[#e5eadd] bg-[#f6f8f1] px-4 py-4"><div className="absolute -right-5 -top-5 h-20 w-20 rounded-full border-[12px] border-[#e9eee0]/70" /><BookOpen size={20} strokeWidth={1.5} className="relative mb-3 text-[#77936a]" /><p className="relative text-xs font-semibold text-[#617954]">A little more organized.</p><p className="relative mt-2 text-[10px] leading-[18px] text-[#97a18a]">Less guesswork. More getting<br />things done.</p><button onClick={() => setGuideOpen(true)} className="relative mt-3 flex items-center gap-2 text-[10px] font-semibold text-[#6e895f]">Meet your workspace<ArrowRight size={12} /></button></div>
        <button onClick={() => setGuideOpen(true)} className="mt-5 flex w-full items-center gap-2.5 px-2 py-2 text-[11px] text-[#8c9a84] hover:text-brand-600"><CircleHelp size={16} strokeWidth={1.6} />Help & getting started<ChevronRight size={13} className="ml-auto" /></button></div>
      <div className="flex items-center gap-2.5 border-t border-[#edf0e9] px-5 py-4"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#eff3eb] text-[#839775]">{username ? <span className="text-[10px] font-semibold">{username.slice(0, 2).toUpperCase()}</span> : <UserRound size={16} strokeWidth={1.6} />}</span><div className="min-w-0"><p className="truncate text-[11px] font-semibold text-[#5e7456]">{username || "Guest workspace"}</p><p className="mt-0.5 text-[9px] text-[#a1ac98]">{username ? "Warehouse member" : "You’re in read-only mode"}</p></div><button aria-label={username ? "Sign out" : "Sign in"} title={username ? "Sign out" : "Sign in"} onClick={username ? signOut : () => requireAuth()} className="ml-auto rounded-md p-1.5 text-[#91a088] hover:bg-[#f3f6ee]">{username ? <LogOut size={15} /> : <LogIn size={15} />}</button></div>
    </aside>
    <div className="lg:ml-[232px]">
      <header className="flex h-[73px] items-center justify-between gap-4 border-b border-[#e5eae2] bg-white px-5 sm:px-8"><div className="flex items-center gap-3"><button aria-label="Open navigation" onClick={() => setSidebarOpen(true)} className="text-[#7c8980] lg:hidden"><Menu size={21} /></button><span className="hidden text-xs text-[#97a28f] sm:block">Workspace</span><ChevronRight size={12} className="hidden text-[#bbc4b5] sm:block" /><button onClick={() => navigate(section === "inventory" ? "/" : `/${section}`)} className="text-xs font-medium text-[#677c5c]">{title}</button>{itemMatch && <><ChevronRight size={12} className="text-[#bbc4b5]" /><span className="text-xs text-[#97a28f]">Item details</span></>}</div><div className="flex items-center gap-5"><span className="hidden items-center gap-2 text-[11px] text-[#97a28f] md:flex"><CalendarDays size={14} strokeWidth={1.5} />{new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span><span className="hidden h-5 w-px bg-[#e8ece4] md:block" />{username ? <button onClick={signOut} className="flex items-center gap-2.5 text-xs font-medium text-[#6a7e60]"><span className="flex h-8 w-8 items-center justify-center rounded-full border border-brand-100 bg-brand-50 text-[10px] font-semibold text-brand-700">{username.slice(0, 2).toUpperCase()}</span><span className="max-w-28 truncate">{username}</span><LogOut size={14} className="text-[#99a58f]" /></button> : <button onClick={() => requireAuth()} className="flex items-center gap-2 rounded-lg border border-[#e2e8dc] bg-white px-3.5 py-2 text-[11px] font-medium text-[#6a7e60] hover:bg-brand-50"><UserRound size={14} />Sign in<ChevronDown size={12} className="text-[#99a58f]" /></button>}</div></header>
      <main className="mx-auto max-w-[1510px] px-5 pb-6 pt-7 sm:px-8 sm:pt-8">
        {loading ? <Loading /> : loadError ? <div className="rounded-xl border border-[#e0e6e0] bg-white p-6"><ErrorNotice message={loadError} /><button onClick={() => setRevision(value => value + 1)} className={`${secondaryClass} mt-4`}>Try again</button></div> : itemMatch ? <ItemDetail key={itemMatch[1]} id={Number(itemMatch[1])} revision={revision} actions={actions} signedIn={!!username} authenticate={() => requireAuth()} changed={change} back={() => navigate("/")} /> : section === "activity" ? <ActivityView revision={revision} navigate={navigate} /> : section === "locations" ? <LocationsView overview={overview} select={location => { setFilters({ q: "", lowStock: false, location }); navigate("/"); }} /> : <Inventory overview={overview} filters={filters} setFilters={setFilters} revision={revision} actions={actions} add={() => requireAuth(() => setItemForm("new"))} notify={setToast} />}
        <footer className="mt-7 flex flex-wrap items-center justify-between gap-3 text-[10px] text-[#a2ad9b]"><span>Made for a well-run warehouse.</span><span className="flex items-center gap-1.5"><span className={`h-1.5 w-1.5 rounded-full ${loadError ? "bg-amber-400" : "bg-[#7ba876]"}`} />{loadError ? "Connection unavailable" : "All systems operational"}<span className="mx-2 text-[#d1d8c9]">·</span>Stockroom v1.0</span></footer>
      </main>
    </div>
    {authOpen && <AuthModal close={() => { setAuthOpen(false); afterAuth.current = null; }} success={name => { setUsername(name); setAuthOpen(false); setToast(`Welcome to your workspace, ${name}.`); afterAuth.current?.(); afterAuth.current = null; }} />}
    {itemForm && <ItemForm item={itemForm} locations={overview.locations.map(row => row.location)} close={() => setItemForm(null)} saved={(_item, isNew) => { setItemForm(null); change(isNew ? "New item added to your warehouse." : "Item details updated."); }} />}
    {deleteItem && <DeleteModal item={deleteItem} close={() => setDeleteItem(null)} deleted={() => { if (itemMatch && Number(itemMatch[1]) === deleteItem.id) navigate("/"); setDeleteItem(null); change("Item and its movement history deleted."); }} />}
    {guideOpen && <Modal title="A clearer view of your warehouse." subtitle="Meet Stockroom. Your day-to-day, a little more organized." close={() => setGuideOpen(false)} wide><div className="space-y-5">{[{ Icon: Package, title: "Give every item a place", text: "Add an item with its own unique SKU, storage location, opening quantity, and reorder level. Use search and filters to find it in seconds." }, { Icon: Activity, title: "Keep every movement in sight", text: "Open an item to receive or take out stock. Every movement records the quantity, reason, time, and person behind it. Stock can never go below zero." }, { Icon: ShieldCheck, title: "Know when it’s time to restock", text: "Items at or below their reorder level are highlighted. Turn on “Low stock only” to see what needs your attention." }, { Icon: UserRound, title: "Public inventory. Secure changes.", text: "Anyone can explore inventory and movement history. Create an account or sign in to add items, update details, and record stock." }].map(({ Icon, title, text }) => <div key={title} className="flex gap-4"><span className="h-fit rounded-lg bg-brand-50 p-2.5 text-brand-600"><Icon size={19} strokeWidth={1.6} /></span><div><h3 className="text-sm font-semibold text-ink">{title}</h3><p className="mt-1.5 text-xs leading-6 text-[#8b988d]">{text}</p></div></div>)}<button onClick={() => setGuideOpen(false)} className={`${primaryClass} mt-2 w-full`}>Got it. Let’s get organized.<ArrowRight size={15} /></button></div></Modal>}
    {toast && <Toast message={toast} close={dismissToast} />}
  </div>;
}

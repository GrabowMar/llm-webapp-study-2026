import { Activity, ArrowRight, ArrowUpRight, Check, ChevronDown, ChevronRight, CircleHelp, Clock3, Columns3, Grid2X2, Leaf, List, LoaderCircle, LogOut, MapPin, Menu, Plus, Radio, RefreshCw, Search, ShieldCheck, SlidersHorizontal, Sprout, UserRound, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Sensor, Reading, Session, View } from "./types";
import { api, ApiError, isRecent, numberFormat, timeAgo } from "./types";
import { demoReadings, demoSensors } from "./demo";
import SensorCard from "./SensorCard";
import { sensorStyle } from "./sensorStyle";
import SensorDetail from "./SensorDetail";
import { AuthModal, DeleteModal, Modal, primaryClass, ReadingModal, SensorModal } from "./Modal";

type Dialog = { type: "auth" } | { type: "sensor" } | { type: "reading"; sensor: Sensor } | { type: "delete"; sensor: Sensor } | { type: "about" } | null;

function initialSession(): Session | null {
  try {
    const stored = JSON.parse(localStorage.getItem("fieldwork-session") || "null");
    return stored && typeof stored.token === "string" && typeof stored.username === "string" ? stored : null;
  } catch { return null; }
}

function routeSensor() {
  const match = window.location.pathname.match(/^\/sensors\/(-?\d+)\/?$/);
  return match ? Number(match[1]) : null;
}

function Brand({ compact = false }: { compact?: boolean }) {
  return <div className="flex items-center gap-2.5"><span className="flex size-8 items-center justify-center rounded-[10px] bg-forest text-lime"><Sprout size={22} strokeWidth={1.8} /></span>{!compact && <span className="text-[23px] font-semibold tracking-[-1px]">fieldwork<span className="text-[#8ea377]">.</span></span>}</div>;
}

function GardenIllustration() {
  return <svg viewBox="0 0 200 120" className="h-[120px] w-[200px]" fill="none" aria-hidden="true"><circle cx="112" cy="63" r="48" fill="#dfe9ce" /><circle cx="112" cy="63" r="35" stroke="#c0d2a5" strokeDasharray="3 5" /><path d="M111 104V48M111 84L88 64M111 71L133 48" stroke="#638450" strokeWidth="2" /><path d="M111 60C85 60 88 40 89 37C109 38 119 46 111 60Z" fill="#829b62" /><path d="M113 73C111 54 124 41 144 45C142 65 130 74 113 73Z" fill="#a9bd86" /><path d="M106 86C86 89 73 77 73 60C92 58 107 67 106 86Z" fill="#bbcba3" /><path d="M97 104H126L123 117H100L97 104Z" fill="#78915f" /><rect x="40" y="43" width="28" height="35" rx="7" fill="#f7f9f0" stroke="#bac9aa" /><path d="M54 52V63" stroke="#78915f" strokeWidth="2" strokeLinecap="round" /><circle cx="54" cy="67" r="4" fill="#a7ba8b" /><path d="M63 37C73 28 85 25 98 25M158 75C167 69 173 59 173 50" stroke="#a6bc8a" strokeDasharray="3 4" /><circle cx="174" cy="44" r="5" fill="#bdcf9e" /><path d="M151 23V29M148 26H154M49 93V99M46 96H52" stroke="#9fb583" strokeWidth="1.5" strokeLinecap="round" /></svg>;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(initialSession);
  const [sensors, setSensors] = useState<Sensor[]>([]);
  const [histories, setHistories] = useState<Record<number, Reading[]>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [syncedAt, setSyncedAt] = useState<Date | null>(null);
  const [view, setView] = useState<View>("overview");
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [mobileNav, setMobileNav] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [sensorId, setSensorId] = useState<number | null>(routeSensor);
  const [detail, setDetail] = useState<Sensor | null>(null);
  const [detailReadings, setDetailReadings] = useState<Reading[]>([]);
  const [detailTotal, setDetailTotal] = useState(0);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [limit, setLimit] = useState(100);
  const [toast, setToast] = useState("");
  const requestVersion = useRef(0);
  const detailVersion = useRef(0);
  const demo = !loading && !error && !sensors.length && !session;
  const displayedSensors = demo ? demoSensors : sensors;
  const cancelSensorRequests = useCallback(() => { requestVersion.current++; }, []);
  const cancelDetailRequests = useCallback(() => { detailVersion.current++; }, []);

  const loadSensors = useCallback(async () => {
    const version = ++requestVersion.current;
    setRefreshing(true);
    try {
      const result = await api<{ items: Sensor[] }>("/sensors");
      if (version !== requestVersion.current) return;
      setSensors(result.items); setError(""); setSyncedAt(new Date()); setLoading(false);
      const readingResults = await Promise.allSettled(result.items.map(async (sensor) => {
        const response = await api<{ items: Reading[] }>(`/sensors/${sensor.id}/readings?limit=24`);
        return { id: sensor.id, readings: response.items };
      }));
      if (version !== requestVersion.current) return;
      setHistories((previous) => {
        const next = { ...previous };
        readingResults.forEach((result) => { if (result.status === "fulfilled") next[result.value.id] = result.value.readings; });
        return next;
      });
    } catch (exception) { if (version === requestVersion.current) setError(exception instanceof Error ? exception.message : "Unable to load sensors. Please try again."); }
    finally { if (version === requestVersion.current) { setLoading(false); setRefreshing(false); } }
  }, []);

  const loadDetail = useCallback(async () => {
    if (sensorId === null) return;
    const version = ++detailVersion.current;
    setDetailLoading(true);
    try {
      if (sensorId < 0) {
        const sensor = demoSensors.find((item) => item.id === sensorId);
        if (!sensor) throw new Error("Sensor not found.");
        setDetail(sensor); setDetailReadings(demoReadings(sensorId).slice(0, limit)); setDetailTotal(demoReadings(sensorId).length); setDetailError("");
      } else {
        const [sensor, readings] = await Promise.all([api<Sensor>(`/sensors/${sensorId}`), api<{ items: Reading[]; total: number }>(`/sensors/${sensorId}/readings?limit=${limit}`)]);
        if (version !== detailVersion.current) return;
        setDetail(sensor); setDetailReadings(readings.items); setDetailTotal(readings.total); setDetailError("");
      }
    } catch (exception) { if (version === detailVersion.current) setDetailError(exception instanceof Error ? exception.message : "Unable to load sensor."); }
    finally { if (version === detailVersion.current) setDetailLoading(false); }
  }, [sensorId, limit]);

  useEffect(() => {
    void loadSensors();
    const interval = setInterval(() => { void loadSensors(); }, 10000);
    return () => { clearInterval(interval); cancelSensorRequests(); };
  }, [loadSensors, cancelSensorRequests]);

  useEffect(() => {
    void loadDetail();
    const interval = setInterval(() => { void loadDetail(); }, 10000);
    return () => { clearInterval(interval); cancelDetailRequests(); };
  }, [loadDetail, cancelDetailRequests]);

  useEffect(() => {
    const token = session?.token;
    if (!token) return;
    let active = true;
    api<{ username: string }>("/auth/me", {}, token).catch((exception: unknown) => {
      if (active && exception instanceof ApiError && exception.status === 401) {
        localStorage.removeItem("fieldwork-session"); setSession(null); setToast("Your session has expired. Sign in again to manage your sensors.");
      }
    });
    return () => { active = false; };
  }, [session?.token]);

  useEffect(() => {
    const onPopState = () => { setSensorId(routeSensor()); setDetail(null); setDetailError(""); };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => { if (!toast) return; const timeout = setTimeout(() => setToast(""), 5000); return () => clearTimeout(timeout); }, [toast]);

  const navigate = (id: number | null) => {
    window.history.pushState({}, "", id === null ? "/" : `/sensors/${id}`);
    setSensorId(id); setDetail(null); setDetailError(""); setMobileNav(false); window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const changeView = (next: View) => { setView(next); setQuery(""); setLocation(""); navigate(null); };
  const openAuth = (mode: "login" | "register" = "login") => { setAuthMode(mode); setDialog({ type: "auth" }); };
  const addSensor = () => { if (session) setDialog({ type: "sensor" }); else openAuth("register"); };
  const authError = (exception: unknown) => {
    if (exception instanceof ApiError && exception.status === 401) { localStorage.removeItem("fieldwork-session"); setSession(null); setDialog(null); setToast("Your session has expired. Please sign in again."); }
  };
  const signOut = async () => {
    if (session) {
      try { await api("/auth/logout", { method: "POST" }, session.token); }
      catch (exception) { if (!(exception instanceof ApiError && exception.status === 401)) { setToast("Unable to sign out. Please try again."); return; } }
    }
    localStorage.removeItem("fieldwork-session"); setSession(null); setDialog(null); setToast("You’re signed out. You can still explore all sensors.");
  };
  const refresh = () => { void loadSensors(); if (sensorId !== null) void loadDetail(); };
  const ownSensors = displayedSensors.filter((sensor) => sensor.owner === session?.username);
  const visible = displayedSensors.filter((sensor) => (view !== "mine" || sensor.owner === session?.username) && (!location || sensor.location === location) && `${sensor.name} ${sensor.location} ${sensor.unit} ${sensor.owner}`.toLowerCase().includes(query.toLowerCase()));
  const locations = [...new Set(displayedSensors.map((sensor) => sensor.location).filter(Boolean))].sort();
  const recent = displayedSensors.filter(isRecent).length;
  const navItems = [{ id: "overview" as const, label: "Overview", Icon: Grid2X2 }, { id: "all" as const, label: "All sensors", Icon: Radio }, { id: "mine" as const, label: "My sensors", Icon: UserRound }];
  const viewTitle = sensorId !== null ? "Sensor details" : navItems.find((item) => item.id === view)?.label || "Overview";

  return <div className="min-h-screen">
    {mobileNav && <div className="fixed inset-0 z-30 bg-ink/30 lg:hidden" onClick={() => setMobileNav(false)} />}
    <aside className={`fixed inset-y-0 left-0 z-40 flex w-[226px] flex-col border-r border-line bg-[#fcfdf9] px-5 transition-transform lg:translate-x-0 ${mobileNav ? "translate-x-0" : "-translate-x-full"}`}>
      <button onClick={() => changeView("overview")} aria-label="Fieldwork home" className="mb-11 mt-8 self-start rounded px-2"><Brand /></button>
      <div className="px-3 text-[9px] font-semibold uppercase tracking-[1.8px] text-[#9aa38e]">Workspace</div>
      <nav aria-label="Main navigation" className="mt-3 space-y-1">{navItems.map(({ id, label, Icon }) => <button key={id} onClick={() => changeView(id)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-[12px] transition-colors ${sensorId === null && view === id ? "bg-[#eaf0df] font-semibold text-forest" : "text-[#87907d] hover:bg-[#f0f3eb] hover:text-forest"}`}><Icon size={16} strokeWidth={1.7} />{label}{id === "all" && <span className="ml-auto rounded bg-white/70 px-1.5 py-0.5 text-[9px] text-[#82916e]">{displayedSensors.length}</span>}{sensorId === null && view === id && id === "overview" && <span className="ml-auto size-1.5 rounded-full bg-[#83a066]" />}</button>)}</nav>
      <div className="mx-3 my-7 h-px bg-line" />
      <div className="px-3 text-[9px] font-semibold uppercase tracking-[1.8px] text-[#9aa38e]">Make it yours</div>
      <button onClick={addSensor} className="mt-3 flex items-center gap-3 rounded-lg px-3 py-3 text-[12px] text-[#87907d] hover:bg-[#f0f3eb] hover:text-forest"><Plus size={16} strokeWidth={1.7} />Register a sensor</button>
      <div className="mt-auto pb-5">
        {!session && <div className="relative mb-5 overflow-hidden rounded-xl border border-[#e3ead6] bg-[#f0f4e7] p-4"><Leaf size={20} className="mb-3 text-[#83986d]" strokeWidth={1.5} /><h3 className="text-[12px] font-semibold">A space for your sensors.</h3><p className="mt-2 text-[10px] leading-[1.8] text-[#8a957b]">Create an account to connect,<br />record, and watch things grow.</p><button onClick={() => openAuth("register")} className="mt-4 flex w-full items-center justify-between rounded-lg border border-[#d7e1c9] bg-white/75 px-3 py-2.5 text-[10px] font-medium text-forest">Get started<ArrowUpRight size={13} /></button></div>}
        <button onClick={() => setDialog({ type: "about" })} className="mb-4 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[11px] text-muted hover:bg-[#f0f3eb]"><CircleHelp size={15} strokeWidth={1.6} />About this workspace<ArrowUpRight size={12} className="ml-auto" /></button>
        <div className="flex items-center gap-2.5 border-t border-line px-2 pt-5"><span className="flex size-8 items-center justify-center rounded-lg border border-line bg-white"><Sprout size={16} className="text-[#84976e]" /></span><div><p className="text-[10px] font-medium">{session ? session.username : "Open workspace"}</p><p className="mt-1 flex items-center gap-1 text-[9px] text-muted"><span className="size-1 rounded-full bg-[#92ab76]" />{demo ? "Demo sensors · Public view" : "Connected to the little things"}</p></div></div>
      </div>
    </aside>

    <div className="lg:ml-[226px]">
      <header className="flex h-[78px] items-center justify-between border-b border-line bg-[#fcfdf9]/80 px-5 sm:px-9 lg:px-10">
        <div className="flex items-center gap-3"><button onClick={() => setMobileNav(true)} aria-label="Open navigation" className="rounded p-1.5 text-muted lg:hidden"><Menu size={20} /></button><span className="hidden text-[11px] text-[#a0a793] sm:inline">Workspace</span><ChevronRight size={12} className="hidden text-[#adb4a4] sm:block" /><span className="text-[11px] font-medium">{viewTitle}</span>{demo && <span className="ml-2 hidden rounded-md border border-line bg-canvas px-2 py-1 text-[9px] text-muted sm:inline">Demo workspace</span>}</div>
        <div className="flex items-center gap-3 sm:gap-5"><span className="hidden items-center gap-1.5 text-[10px] text-muted xl:flex"><Clock3 size={12} />{new Date().toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}</span><button onClick={refresh} aria-label="Refresh sensors" disabled={refreshing} className="rounded-lg p-2 text-[#8a947e] hover:bg-line/60 disabled:opacity-50"><RefreshCw size={15} strokeWidth={1.7} className={refreshing ? "animate-spin" : ""} /></button><span className="h-5 w-px bg-line" />{session ? <div className="flex items-center gap-3"><span className="flex items-center gap-2 text-xs"><span className="flex size-7 items-center justify-center rounded-full bg-[#eaf0df] text-[10px] font-semibold text-forest">{session.username.slice(0, 1).toUpperCase()}</span><span className="max-w-24 truncate">{session.username}</span></span><button onClick={() => { void signOut(); }} aria-label="Sign out" title="Sign out" className="rounded p-1.5 text-muted hover:text-forest"><LogOut size={15} /></button></div> : <button onClick={() => openAuth()} className="flex items-center gap-2 rounded-lg border border-[#dfe5d7] bg-white px-3.5 py-2 text-[11px] font-medium text-[#627453] hover:bg-[#f0f4e9]"><UserRound size={13} />Sign in<ArrowRight size={12} className="hidden sm:block" /></button>}</div>
      </header>

      <main className="mx-auto max-w-[1500px] px-5 pb-8 pt-8 sm:px-9 lg:px-10 lg:pt-9">
        {sensorId === null ? <>
          <div className="mb-7 flex flex-wrap items-start justify-between gap-5"><div><div className="mb-3 flex items-center gap-2 text-[9px] font-medium uppercase tracking-[1.7px] text-[#8f9c80]"><span className="h-px w-5 bg-[#a8b994]" />Small signals. Bigger picture.</div><h1 className="text-[31px] font-semibold leading-tight tracking-[-1.2px] sm:text-[34px]">Your environment, in view<span className="text-[#91a878]">.</span></h1><p className="mt-3 text-[12px] leading-relaxed text-[#8b9481]">A live look at the little things that keep your world running.</p></div><div className="mt-5 flex items-center gap-2 rounded-full border border-[#dde7d0] bg-[#eef4e4] px-3 py-2 text-[10px] text-[#7c9264]"><span className="relative flex size-1.5"><span className={`absolute inline-flex size-full rounded-full bg-[#99b67c] opacity-70 ${error ? "" : "animate-ping"}`} /><span className="relative size-1.5 rounded-full bg-[#88a668]" /></span>{error ? "Connection interrupted" : "Auto-refresh every 10s"}</div></div>

          <section aria-label="Workspace statistics" className="mb-9 grid grid-cols-2 gap-3 xl:grid-cols-4 xl:gap-4">
            {[{ label: "Total sensors", value: displayedSensors.length, Icon: Radio, footer: "Little windows into your world", accent: false }, { label: "Reporting now", value: recent, Icon: Activity, footer: displayedSensors.length ? `${Math.round((recent / displayedSensors.length) * 100)}% of sensors are reporting` : "Ready for your first reading", accent: true }, { label: "Locations", value: locations.length, Icon: MapPin, footer: "Spaces you’re keeping an eye on", accent: false }, { label: "Your sensors", value: ownSensors.length, Icon: ShieldCheck, footer: session ? "Connected and owned by you" : "Sign in to start your collection", accent: false }].map(({ label, value, Icon, footer, accent }) => <div key={label} className={`rounded-xl border p-4 sm:p-5 ${accent ? "border-[#dce6cd] bg-[#eef3e5]" : "border-line bg-[#fdfefa]"}`}><div className="flex items-center justify-between"><span className="text-[10px] font-medium text-[#8c977d]">{label}</span><Icon size={16} strokeWidth={1.5} className={accent ? "text-[#78925d]" : "text-[#9ba68e]"} /></div><div className="mt-4 flex items-baseline gap-2"><span className="text-[31px] font-medium leading-none tracking-[-1px]">{value.toString().padStart(2, "0")}</span>{accent && <span className="mb-1 flex items-center gap-1 text-[9px] text-[#8aa46d]"><span className="size-1 rounded-full bg-[#8fa872]" />Active</span>}</div><p className="mt-3 truncate text-[9px] text-[#98a18d]">{footer}</p></div>)}
          </section>

          <section aria-label="Sensor overview">
            <div className="mb-5 flex items-center justify-between gap-3"><div className="flex items-center gap-2.5"><h2 className="text-[17px] font-semibold tracking-[-0.4px]">{view === "mine" ? "Your sensors" : "Sensor overview"}</h2><span className="rounded-md border border-line bg-[#eff2e9] px-1.5 py-0.5 text-[9px] text-[#82916e]">{view === "mine" ? ownSensors.length : displayedSensors.length}</span></div><button onClick={addSensor} className={primaryClass}><Plus size={14} />Register sensor</button></div>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-1 rounded-lg border border-line bg-[#ecefe7] p-0.5"><button onClick={() => setView(view === "all" ? "all" : "overview")} className={`rounded-md px-3 py-2 text-[10px] ${view !== "mine" ? "bg-white font-medium text-forest shadow-xs" : "text-[#8c9781] hover:text-forest"}`}>All sensors <span className="ml-1 text-[#98a38c]">{displayedSensors.length}</span></button><button onClick={() => setView("mine")} className={`rounded-md px-3 py-2 text-[10px] ${view === "mine" ? "bg-white font-medium text-forest shadow-xs" : "text-[#8c9781] hover:text-forest"}`}>My sensors <span className="ml-1 text-[#98a38c]">{ownSensors.length}</span></button></div>
              <div className="flex flex-1 items-center justify-end gap-2 sm:flex-none"><div className="relative min-w-0 flex-1 sm:w-[183px]"><Search size={13} className="pointer-events-none absolute left-3 top-2.5 text-[#9da58f]" /><input aria-label="Search sensors" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search sensors..." className="w-full rounded-lg border border-line bg-[#fcfdf9] py-2.5 pl-8 pr-3 text-[10px] placeholder:text-[#a3ab96]" /></div><div className="relative"><SlidersHorizontal size={13} className="pointer-events-none absolute left-2.5 top-2.5 text-[#89967c]" /><select aria-label="Filter by location" value={location} onChange={(event) => setLocation(event.target.value)} className="w-[35px] appearance-none rounded-lg border border-line bg-[#fcfdf9] py-2.5 pl-8 pr-2 text-[10px] text-[#89967c] sm:w-[120px] sm:pr-6"><option value="">All locations</option>{locations.map((item) => <option key={item} value={item}>{item}</option>)}</select><ChevronDown size={11} className="pointer-events-none absolute right-2 top-3 hidden text-[#89967c] sm:block" /></div><div className="flex rounded-lg border border-line bg-[#fcfdf9] p-0.5"><button onClick={() => setLayout("grid")} aria-label="Grid view" aria-pressed={layout === "grid"} className={`rounded-md p-2 ${layout === "grid" ? "bg-[#edf1e5] text-[#718660]" : "text-[#a4ad96]"}`}><Grid2X2 size={13} /></button><button onClick={() => setLayout("list")} aria-label="List view" aria-pressed={layout === "list"} className={`rounded-md p-2 ${layout === "list" ? "bg-[#edf1e5] text-[#718660]" : "text-[#a4ad96]"}`}><List size={13} /></button></div></div>
            </div>

            {error && <div role="alert" className="mb-5 flex items-center justify-between rounded-lg border border-[#e5d6bc] bg-[#faf3e7] px-4 py-3 text-xs text-[#99815b]"><span>{error}</span><button onClick={refresh} className="ml-3 shrink-0 underline">Try again</button></div>}
            {loading ? <div className="flex h-72 items-center justify-center gap-2 text-sm text-muted"><LoaderCircle size={18} className="animate-spin" />Connecting to your workspace…</div> : !visible.length ? <div className="flex min-h-72 flex-col items-center justify-center rounded-xl border border-dashed border-[#d4dec8] bg-white/40 p-6 text-center"><div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-[#eaf0df]"><Sprout size={25} className="text-[#829869]" strokeWidth={1.5} /></div><h3 className="text-base font-semibold">{query || location ? "No sensors found." : view === "mine" && !session ? "A little space of your own." : "Every connection starts somewhere."}</h3><p className="mt-2 max-w-sm text-xs leading-relaxed text-muted">{query || location ? "Try a different search or location to find what you’re looking for." : view === "mine" && !session ? "Sign in to view your sensors, record readings, and make this workspace yours." : "Register your first sensor and bring a little more of your environment into view."}</p><button onClick={() => { if (query || location) { setQuery(""); setLocation(""); } else if (view === "mine" && !session) openAuth(); else addSensor(); }} className={`${primaryClass} mt-5`}>{query || location ? "Clear filters" : view === "mine" && !session ? "Sign in" : "Register your first sensor"}<ArrowRight size={13} /></button></div> : layout === "grid" ? <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">{visible.map((sensor) => <SensorCard key={sensor.id} sensor={sensor} readings={demo ? demoReadings(sensor.id) : histories[sensor.id] || []} onOpen={() => navigate(sensor.id)} demo={demo} />)}</div> : <div className="overflow-x-auto rounded-xl border border-line bg-white"><table className="w-full text-left text-xs"><thead className="bg-[#f0f3ea] text-[9px] uppercase tracking-wider text-muted"><tr><th className="px-5 py-3.5">Sensor</th><th className="px-5 py-3.5">Location</th><th className="px-5 py-3.5">Latest value</th><th className="px-5 py-3.5">Updated</th><th className="px-5 py-3.5">Owner</th></tr></thead><tbody>{visible.map((sensor) => { const style = sensorStyle(sensor); return <tr key={sensor.id} className="border-t border-line/80 hover:bg-canvas"><td className="px-5 py-4"><button onClick={() => navigate(sensor.id)} className="flex items-center gap-3 whitespace-nowrap rounded font-medium hover:text-forest"><span className={`rounded-lg p-2 ${style.background} ${style.text}`}><style.Icon size={15} /></span>{sensor.name}<ArrowUpRight size={12} className="text-muted" /></button></td><td className="whitespace-nowrap px-5 py-4 text-muted">{sensor.location || "—"}</td><td className="whitespace-nowrap px-5 py-4 font-medium">{sensor.last_value === null ? "—" : numberFormat(sensor.last_value)} <span className="font-normal text-muted">{sensor.unit}</span></td><td className="whitespace-nowrap px-5 py-4 text-muted">{timeAgo(sensor.last_updated)}</td><td className="whitespace-nowrap px-5 py-4 text-muted">{sensor.owner}</td></tr>; })}</tbody></table></div>}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[9px] text-[#a2aa96]"><span>{demo ? "Illustrative demo readings · Connect your own sensors to get started" : `Showing ${visible.length} of ${displayedSensors.length} sensors · Sorted by name`}</span><span className="flex items-center gap-1.5"><RefreshCw size={10} />{syncedAt ? `Last synced ${syncedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Connecting…"}</span></div>
          </section>

          <section className="relative mt-8 flex min-h-[132px] items-center justify-between overflow-hidden rounded-xl border border-[#e1e8d6] bg-[#edf2e4] px-6 py-6"><div className="relative z-10"><div className="mb-2 flex items-center gap-2"><span className="size-1.5 rounded-full bg-[#90a771]" /><span className="text-[9px] font-medium uppercase tracking-[1.4px] text-[#8e9f79]">Built for the curious</span></div><h2 className="text-[17px] font-medium tracking-[-0.4px]">Big peace of mind. Little sensors.</h2><p className="mt-2 max-w-[340px] text-[10px] leading-relaxed text-[#95a086]">{session ? "Connect another corner of your world. Your next sensor is a few clicks away." : "From your greenhouse to your favorite corner — keep an eye on what matters."}</p><button onClick={addSensor} className="mt-3 flex items-center gap-1.5 rounded text-[10px] font-semibold text-[#6b8056] hover:text-forest">{session ? "Connect a new sensor" : "Make this workspace yours"}<ArrowRight size={12} /></button></div><div className="absolute -right-5 bottom-0 opacity-50 sm:relative sm:-my-6 sm:right-0 sm:opacity-100"><GardenIllustration /></div></section>
        </> : detailError ? <div className="rounded-xl border border-line bg-white p-10 text-center"><Radio size={30} className="mx-auto mb-4 text-muted" /><h1 className="text-xl font-semibold">{detailError}</h1><div className="mt-5 flex justify-center gap-3"><button onClick={() => navigate(null)} className="rounded-lg border border-line px-4 py-2.5 text-xs">Back to dashboard</button><button onClick={() => { void loadDetail(); }} className={primaryClass}>Try again</button></div></div> : !detail || detail.id !== sensorId ? <div className="flex h-80 items-center justify-center gap-2 text-sm text-muted"><LoaderCircle size={18} className="animate-spin" />Loading sensor…</div> : <SensorDetail sensor={detail} readings={detailReadings} total={detailTotal} own={detail.owner === session?.username && detail.id > 0} demo={detail.id < 0} limit={limit} setLimit={setLimit} onBack={() => navigate(null)} onReading={() => setDialog({ type: "reading", sensor: detail })} onDelete={() => setDialog({ type: "delete", sensor: detail })} />}

        <footer className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5 text-[9px] text-[#a6ad9d]"><span>Thoughtfully connected. <span className="text-[#899c74]">Fieldwork.</span></span><span className="flex items-center gap-1.5"><span className={`size-1 rounded-full ${error || detailError ? "bg-[#b5a27c]" : "bg-[#9eb480]"}`} />{detailLoading ? "Refreshing readings" : error || detailError ? "Connection needs attention" : "All systems growing"}<span className="mx-2 text-[#ced4c5]">/</span><span>Made for the little things</span></span></footer>
      </main>
    </div>

    {dialog?.type === "auth" && <AuthModal mode={authMode} setMode={setAuthMode} onClose={() => setDialog(null)} onLogin={(next) => { localStorage.setItem("fieldwork-session", JSON.stringify(next)); setSession(next); setDialog(null); setToast(`Welcome, ${next.username}. Make yourself at home.`); if (sensorId !== null && sensorId < 0) navigate(null); void loadSensors(); }} />}
    {dialog?.type === "sensor" && session && <SensorModal session={session} onClose={() => setDialog(null)} onError={authError} onCreated={(sensor) => { setDialog(null); setSensors((previous) => [...previous, sensor].sort((a, b) => a.name.localeCompare(b.name))); setToast("Sensor registered. Add a reading to bring it to life."); navigate(sensor.id); void loadSensors(); }} />}
    {dialog?.type === "reading" && session && <ReadingModal sensor={dialog.sensor} session={session} onClose={() => setDialog(null)} onError={authError} onSaved={() => { setDialog(null); setToast("Fresh reading recorded."); refresh(); }} />}
    {dialog?.type === "delete" && session && <DeleteModal sensor={dialog.sensor} session={session} onClose={() => setDialog(null)} onError={authError} onDeleted={() => { setDialog(null); setSensors((previous) => previous.filter((sensor) => sensor.id !== dialog.sensor.id)); setToast("Sensor and its readings deleted."); navigate(null); void loadSensors(); }} />}
    {dialog?.type === "about" && <Modal title="Small signals. Shared space." description="Fieldwork brings your environment into view, one sensor at a time." onClose={() => setDialog(null)}><div className="space-y-4 text-xs leading-relaxed text-muted"><p className="flex gap-3"><Columns3 size={17} className="mt-0.5 shrink-0 text-[#81966b]" /><span>Everyone can explore sensors and their history. Your dashboard checks for fresh readings every 10 seconds.</span></p><p className="flex gap-3"><ShieldCheck size={17} className="mt-0.5 shrink-0 text-[#81966b]" /><span>Only a sensor’s owner can record readings or delete it. Accounts and readings are stored persistently.</span></p><p className="flex gap-3"><Leaf size={17} className="mt-0.5 shrink-0 text-[#81966b]" /><span>When the public workspace is empty, clearly marked demo sensors show what’s possible. Demo data isn’t stored in your workspace.</span></p></div><button onClick={() => setDialog(null)} className={`${primaryClass} mt-6 w-full`}>A little more connected<Check size={14} /></button></Modal>}
    {toast && <div role="status" className="fixed bottom-6 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-3 rounded-xl border border-[#dbe5ce] bg-[#fcfdf9] px-4 py-3.5 shadow-lg"><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#edf3e4] text-[#78935d]"><Check size={12} /></span><p className="flex-1 text-xs leading-relaxed">{toast}</p><button onClick={() => setToast("")} aria-label="Dismiss notification" className="rounded p-1 text-muted"><X size={13} /></button></div>}
  </div>;
}

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, ApiError, fullShortUrl } from "./api";
import type { Link, Page, Stats, User } from "./api";
import AuthDialog from "./AuthDialog";
import type { AuthMode } from "./AuthDialog";
import Icon from "./Icon";
import type { IconName } from "./Icon";
import Modal from "./Modal";

type View = "overview" | "mine" | "admin";
type Toast = { message: string; error?: boolean };
const PAGE_SIZE = 5;
const numberFormat = new Intl.NumberFormat();
const dateFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });

function savedToken() {
  try { return localStorage.getItem("trim_token"); } catch { return null; }
}

function saveToken(token: string | null) {
  try {
    if (token) localStorage.setItem("trim_token", token);
    else localStorage.removeItem("trim_token");
  } catch { return; }
}

function domain(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

function MiniIllustration() {
  return (
    <div aria-hidden="true" className="relative hidden h-40 w-72 shrink-0 lg:block">
      <div className="absolute right-7 top-2 h-36 w-36 rounded-full border border-[#dce8df]" />
      <div className="absolute right-12 top-7 h-26 w-26 rounded-full bg-[#e8f0e9]" />
      <span className="absolute right-5 top-1 text-[#a0b89c]"><Icon name="spark" className="h-5 w-5" /></span>
      <span className="absolute bottom-1 left-7 h-2 w-2 rounded-full bg-[#acbea3]" />
      <div className="absolute left-0 top-8 flex -rotate-8 items-center gap-3 rounded-xl border border-stone-200/80 bg-white px-4 py-3 shadow-[0_5px_20px_#203c3106]">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-stone-100 text-stone-400"><Icon name="globe" className="h-4 w-4" /></div>
        <div className="space-y-1.5"><div className="h-1.5 w-28 rounded-full bg-stone-200" /><div className="h-1.5 w-20 rounded-full bg-stone-100" /></div>
      </div>
      <div className="absolute bottom-6 right-1 flex rotate-6 items-center gap-3 rounded-xl border border-white/80 bg-forest px-5 py-3.5 text-white shadow-[0_8px_24px_#28634b20]">
        <Icon name="link" className="h-5 w-5" /><span className="text-sm font-medium tracking-wide">Short. Sweet. Shared.</span><Icon name="check" className="h-4 w-4 text-[#b9d5b8]" />
      </div>
      <span className="absolute bottom-9 left-10 -rotate-25 text-[#88a68c]"><Icon name="arrow" className="h-7 w-7" /></span>
    </div>
  );
}

function StatCard({ icon, label, value, note, tone }: { icon: IconName; label: string; value?: number; note: string; tone: "green" | "blue" | "orange" }) {
  const tones = { green: "bg-mint text-forest", blue: "bg-[#edf0f7] text-[#7685ad]", orange: "bg-[#fcf1e8] text-[#c69162]" };
  return (
    <div className="rounded-2xl border border-[#e6eae5] bg-white p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between"><span className="text-[13px] font-medium text-stone-500">{label}</span><div className={`flex h-9 w-9 items-center justify-center rounded-xl ${tones[tone]}`}><Icon name={icon} className="h-[18px] w-[18px]" /></div></div>
      <div className="text-[30px] font-semibold leading-none tracking-tight">{value === undefined ? <span className="inline-block h-8 w-12 animate-pulse rounded bg-stone-100" /> : numberFormat.format(value)}</div>
      <p className="mt-3 text-xs text-stone-400">{note}</p>
    </div>
  );
}

export default function App() {
  const [token, setToken] = useState<string | null>(savedToken);
  const [user, setUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [view, setView] = useState<View>("overview");
  const [mobileNav, setMobileNav] = useState(false);
  const [url, setUrl] = useState("");
  const [shortening, setShortening] = useState(false);
  const [formError, setFormError] = useState("");
  const [created, setCreated] = useState<Link | null>(null);
  const [links, setLinks] = useState<Page | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [revision, setRevision] = useState(0);
  const [toast, setToast] = useState<Toast | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<Link | null>(null);
  const [actionBusy, setActionBusy] = useState<number | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    api<User>("/auth/me", { signal: controller.signal }, token).then(setUser).catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 401) {
        saveToken(null);
        setToken(null);
        setUser(null);
      } else if (error instanceof ApiError) {
        setToast({ message: error.message, error: true });
      }
    });
    return () => controller.abort();
  }, [token]);

  useEffect(() => {
    const timeout = window.setTimeout(() => { setQuery(search); setPage(1); }, 300);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setListError("");
      const endpoint = view === "admin" ? "/admin/links" : view === "mine" ? "/links/mine" : "/links";
      try {
        const result = await api<Page>(`${endpoint}?page=${page}&page_size=${PAGE_SIZE}&q=${encodeURIComponent(query)}`, { signal: controller.signal }, token);
        if (controller.signal.aborted) return;
        if (page > 1 && result.items.length === 0) {
          setPage(Math.max(1, Math.ceil(result.total / PAGE_SIZE)));
        } else {
          setLinks(result);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setListError(error instanceof Error ? error.message : "Unable to load links.");
          if (error instanceof ApiError && error.status === 401) {
            saveToken(null);
            setToken(null);
            setUser(null);
            setView("overview");
          }
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [view, page, query, revision, token]);

  useEffect(() => {
    const controller = new AbortController();
    api<Stats>("/stats", { signal: controller.signal }).then(setStats).catch(() => {});
    return () => controller.abort();
  }, [revision]);

  useEffect(() => {
    const onFocus = () => setRevision((value) => value + 1);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (copied === null) return;
    const timeout = window.setTimeout(() => setCopied(null), 2500);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  function navigate(next: View) {
    setMobileNav(false);
    if (next !== "overview" && !user) { setAuthMode("login"); return; }
    setView(next);
    setPage(1);
    setSearch("");
    setQuery("");
  }

  async function shorten(event: FormEvent) {
    event.preventDefault();
    setFormError("");
    if (!user || !token) { setAuthMode("login"); return; }
    setShortening(true);
    try {
      const result = await api<Link>("/links", { method: "POST", body: JSON.stringify({ original_url: url }) }, token);
      setCreated(result);
      setUrl("");
      setPage(1);
      setSearch("");
      setQuery("");
      setRevision((value) => value + 1);
      setToast({ message: "A little link, ready for big things." });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to shorten this address.");
      if (error instanceof ApiError && error.status === 401) {
        saveToken(null);
        setToken(null);
        setUser(null);
        setView("overview");
        setAuthMode("login");
      }
    } finally {
      setShortening(false);
    }
  }

  async function copy(link: Link) {
    const text = fullShortUrl(link);
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const field = document.createElement("textarea");
        field.value = text;
        field.className = "fixed -left-full top-0";
        document.body.appendChild(field);
        field.select();
        const success = document.execCommand("copy");
        field.remove();
        if (!success) throw new Error("Copy failed");
      }
      setCopied(link.id);
      setToast({ message: "Short link copied to your clipboard." });
    } catch {
      setToast({ message: "Couldn't copy automatically. Select the short address and copy it.", error: true });
    }
  }

  async function signOut() {
    try { await api("/auth/logout", { method: "POST" }, token); } catch { setToast({ message: "Signed out on this device. The server could not be reached.", error: true }); }
    saveToken(null);
    setToken(null);
    setUser(null);
    setCreated(null);
    setView("overview");
    setPage(1);
    setRevision((value) => value + 1);
  }

  async function deleteLink() {
    if (!deleting) return;
    setActionBusy(deleting.id);
    try {
      await api(`/links/${deleting.id}`, { method: "DELETE" }, token);
      if (created?.id === deleting.id) setCreated(null);
      setDeleting(null);
      setRevision((value) => value + 1);
      setToast({ message: "Link permanently deleted." });
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "Unable to delete this link.", error: true });
    } finally { setActionBusy(null); }
  }

  async function toggleLink(link: Link) {
    setActionBusy(link.id);
    try {
      await api(`/admin/links/${link.id}/toggle`, { method: "POST" }, token);
      setRevision((value) => value + 1);
      setToast({ message: link.is_active ? "Link disabled. It will no longer redirect." : "Link re-enabled and ready to share." });
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "Unable to update this link.", error: true });
    } finally { setActionBusy(null); }
  }

  const viewTitle = view === "admin" ? "Moderation" : view === "mine" ? "My links" : "Overview";
  const totalPages = Math.max(1, Math.ceil((links?.total ?? 0) / PAGE_SIZE));
  const navItems: { view: View; label: string; icon: IconName }[] = [{ view: "overview", label: "Overview", icon: "grid" }, { view: "mine", label: "My links", icon: "link" }];

  return (
    <div className="min-h-screen bg-canvas font-sans text-ink selection:bg-[#d6e8d8] [&_button]:cursor-pointer [&_button:disabled]:cursor-not-allowed [&_button]:outline-offset-4 [&_a]:outline-offset-4">
      {mobileNav && <button aria-label="Close navigation" onClick={() => setMobileNav(false)} className="fixed inset-0 z-30 bg-ink/30 backdrop-blur-sm lg:hidden" />}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[232px] flex-col border-r border-[#e6eae5] bg-white px-5 py-8 transition-transform lg:translate-x-0 ${mobileNav ? "translate-x-0" : "-translate-x-full"}`}>
        <button onClick={() => navigate("overview")} aria-label="Trim home" className="mb-12 flex w-fit items-center gap-2.5 px-3"><span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-forest text-white"><Icon name="link" className="h-5 w-5" /></span><span className="text-[29px] font-bold leading-none tracking-[-1.5px]">trim<span className="text-[#83a180]">.</span></span></button>
        <p className="mb-3 px-3 text-[10px] font-semibold tracking-[1.8px] text-stone-400">WORKSPACE</p>
        <nav aria-label="Main navigation" className="space-y-2">
          {navItems.map((item) => <button key={item.view} onClick={() => navigate(item.view)} aria-current={view === item.view ? "page" : undefined} className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-[13px] transition ${view === item.view ? "bg-mint font-semibold text-forest" : "text-stone-500 hover:bg-stone-50 hover:text-ink"}`}><Icon name={item.icon} className="h-[18px] w-[18px]" />{item.label}{view === item.view && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-forest" />}</button>)}
          {user?.is_admin && <><p className="pb-1 pt-6 px-3 text-[10px] font-semibold tracking-[1.8px] text-stone-400">MANAGEMENT</p><button onClick={() => navigate("admin")} aria-current={view === "admin" ? "page" : undefined} className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-[13px] ${view === "admin" ? "bg-mint font-semibold text-forest" : "text-stone-500 hover:bg-stone-50"}`}><Icon name="shield" className="h-[18px] w-[18px]" />Moderation</button></>}
        </nav>
        <div className="mt-auto">
          <div className="relative mb-6 overflow-hidden rounded-2xl bg-[#f1f5ee] px-4 pb-5 pt-6">
            <div aria-hidden="true" className="relative mb-5 flex h-19 items-center justify-center"><div className="absolute h-19 w-19 rounded-full border border-[#d9e4d2]" /><div className="absolute h-13 w-13 rounded-full bg-[#e0eacc]" /><div className="z-10 flex h-10 w-16 -rotate-12 items-center justify-center rounded-xl border border-white bg-white/80 text-forest shadow-sm"><Icon name="link" className="h-6 w-6" /></div><Icon name="spark" className="absolute right-4 top-0 h-3 w-3 text-[#88a173]" /></div>
            <p className="text-sm font-semibold">Less link. More you.</p><p className="mb-4 mt-1.5 text-xs leading-5 text-[#81907c]">Big ideas deserve links that<br />don't get in the way.</p>
            <button onClick={() => setShowHelp(true)} className="flex items-center gap-2 text-xs font-semibold text-forest hover:gap-3 transition-all">How it works<Icon name="arrow" className="h-3.5 w-3.5" /></button>
          </div>
          <div className="flex items-center justify-between border-t border-stone-100 px-3 pt-5"><span className="text-[10px] tracking-wide text-stone-400">A LITTLE GOES A LONG WAY</span><span className="h-1.5 w-1.5 rounded-full bg-[#8eae85]" /></div>
        </div>
      </aside>

      <div className="lg:ml-[232px]">
        <header className="flex h-[88px] items-center justify-between gap-3 border-b border-[#e6eae5] bg-white/70 px-5 sm:px-9 xl:px-12">
          <div className="flex items-center gap-3"><button aria-label="Open navigation" onClick={() => setMobileNav(true)} className="rounded-lg p-1.5 text-stone-500 lg:hidden"><Icon name="menu" /></button><span className="hidden text-xs text-stone-400 sm:block">Workspace</span><Icon name="right" className="hidden h-3 w-3 text-stone-300 sm:block" /><span className="text-xs font-medium">{viewTitle}</span></div>
          <div className="flex items-center gap-3 sm:gap-5">
            <span className="mr-1 hidden items-center gap-2 text-[11px] text-stone-400 xl:flex"><span className="h-1.5 w-1.5 rounded-full bg-[#86a780]" />A little simpler. A lot better.</span>
            {user ? (
              <>
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-mint text-xs font-semibold text-forest">{user.username.slice(0, 2).toUpperCase()}</div>
                  <span className="max-w-30 truncate text-xs font-medium" title={user.username}>{user.username}</span>
                  {user.is_admin && <span className="hidden rounded-md bg-mint px-2 py-1 text-[10px] font-medium text-forest sm:inline">Admin</span>}
                </div>
                <button onClick={() => void signOut()} aria-label="Sign out" className="flex items-center gap-2 rounded-lg border border-stone-200 px-3 py-2 text-xs text-stone-500 transition hover:border-forest hover:text-forest">
                  <span className="hidden sm:inline">Sign out</span><Icon name="logout" className="h-4 w-4" />
                </button>
              </>
            ) : (
              <>
                <button onClick={() => setAuthMode("login")} className="text-xs font-medium text-stone-500 transition hover:text-forest">Sign in</button>
                <button onClick={() => setAuthMode("register")} className="rounded-lg bg-forest px-4 py-2.5 text-xs font-medium text-white transition hover:bg-ink">Create account</button>
              </>
            )}
          </div>
        </header>

        <main className="mx-auto max-w-[1280px] px-5 pb-6 pt-8 sm:px-9 sm:pt-10 xl:px-12">
          <section className="mb-8 flex min-h-36 items-center justify-between gap-6">
            <div><div className="mb-3 flex items-center gap-2 text-[10px] font-semibold tracking-[1.8px] text-[#8b9f82]"><span className="h-[1px] w-5 bg-[#9db18f]" />{view === "admin" ? "A SAFER PLACE TO SHARE" : "LESS LINK. MORE POSSIBILITIES."}</div><h1 className="text-[32px] font-semibold leading-[1.22] tracking-[-1.2px] sm:text-[39px]">{view === "admin" ? <>Good links.<br /><span className="text-forest">In good hands.</span></> : view === "mine" ? <>Your links.<br /><span className="text-forest">All in one little place.</span></> : <>Small links.<br /><span className="text-forest">Big possibilities.</span></>}</h1><p className="mt-3 text-[13px] leading-6 text-stone-500">{view === "admin" ? "Keep the community safe, one link at a time." : view === "mine" ? "A home for everything you've shortened and shared." : "Shorten your URLs. Share your ideas. Make every click count."}</p></div>
            <MiniIllustration />
          </section>

          {view !== "admin" && <section aria-labelledby="shorten-heading" className="mb-6 rounded-2xl border border-[#e1e8df] bg-white p-5 shadow-[0_3px_16px_#203c3103] sm:p-7">
            <div className="mb-5 flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-mint text-forest"><Icon name="link" className="h-5 w-5" /></div><div><h2 id="shorten-heading" className="text-[15px] font-semibold">Shorten a link</h2><p className="mt-1 text-xs text-stone-400">Long URL? Let's make it a little more shareable.</p></div><span className="ml-auto hidden items-center gap-1.5 rounded-full border border-[#e1e8df] px-2.5 py-1 text-[10px] text-[#8a9b82] sm:flex"><Icon name="spark" className="h-3 w-3" />Small but mighty</span></div>
            <form onSubmit={shorten} noValidate>
              <label htmlFor="original-url" className="sr-only">URL to shorten</label>
              <div className="flex flex-col gap-3 sm:flex-row"><div className="relative grow"><Icon name="globe" className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-stone-400" /><input id="original-url" type="url" value={url} onChange={(event) => { setUrl(event.target.value); setFormError(""); }} placeholder="https://example.com/your-very-long-link" autoComplete="url" aria-describedby={formError ? "url-error" : "url-hint"} aria-invalid={!!formError} className="h-[50px] w-full rounded-xl border border-[#dde5da] bg-[#fbfcfa] pl-11 pr-4 text-[13px] outline-none transition placeholder:text-stone-400 focus:border-forest focus:ring-3 focus:ring-forest/10" /></div><button disabled={shortening} className="flex h-[50px] items-center justify-center gap-4 rounded-xl bg-forest px-6 text-[13px] font-semibold text-white transition hover:bg-ink disabled:opacity-60">{shortening ? "Shortening…" : "Shorten link"}<Icon name="arrow" className="h-4 w-4" /></button></div>
              {formError ? <p id="url-error" role="alert" className="mt-3 text-xs leading-5 text-red-600">{formError}</p> : <p id="url-hint" className="mt-3.5 flex items-center gap-1.5 text-[11px] text-stone-400"><Icon name="lock" className="h-3 w-3" />{user ? "Your link is saved to your account. Only you can delete it." : <>Free to use. <button type="button" onClick={() => setAuthMode("login")} className="font-medium text-forest hover:underline">Sign in</button> to create and manage your links.</>}</p>}
            </form>
            {created && <div className="mt-5 flex flex-col justify-between gap-3 rounded-xl border border-[#d8e6d4] bg-[#f3f8ef] p-4 sm:flex-row sm:items-center"><div className="min-w-0"><p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium text-[#789268]"><Icon name="check" className="h-3 w-3" />YOUR LITTLE LINK IS READY</p><a href={created.short_url} target="_blank" rel="noreferrer" className="break-all text-sm font-semibold text-forest hover:underline">{fullShortUrl(created)}</a></div><button onClick={() => void copy(created)} className="flex shrink-0 items-center justify-center gap-2 rounded-lg border border-[#d9e4d3] bg-white px-3.5 py-2.5 text-xs font-medium text-forest transition hover:bg-mint"><Icon name={copied === created.id ? "check" : "copy"} className="h-4 w-4" />{copied === created.id ? "Copied!" : "Copy link"}</button></div>}
          </section>}

          <section aria-label="Link statistics" className="mb-8 grid grid-cols-1 gap-4 min-[480px]:grid-cols-3 sm:gap-5"><StatCard icon="link" label="Active links" value={stats?.total_links} note="Little links, ready to share" tone="green" /><StatCard icon="cursor" label="Total clicks" value={stats?.total_clicks} note="Every connection counts" tone="blue" /><StatCard icon="clock" label="Created today" value={stats?.links_today} note="Fresh links. New possibilities." tone="orange" /></section>

          <section aria-labelledby="links-heading" className="overflow-hidden rounded-2xl border border-[#e6eae5] bg-white">
            <div className="flex flex-col justify-between gap-4 border-b border-stone-100 px-5 py-5 sm:flex-row sm:items-center sm:px-6"><div><div className="flex items-center gap-2.5"><h2 id="links-heading" className="text-[15px] font-semibold">{view === "admin" ? "All links" : view === "mine" ? "My links" : "Recent links"}</h2><span className="rounded-md bg-[#f1f4ee] px-2 py-0.5 text-[10px] font-medium text-[#829277]">{links?.total ?? "—"}</span></div><p className="mt-1.5 text-xs text-stone-400">{view === "admin" ? "An overview of every link, active or disabled." : view === "mine" ? "Created by you. Ready for wherever's next." : "Freshly shortened. Ready to go."}</p></div><div className="flex items-center gap-2"><div className="relative"><Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400" /><input type="search" aria-label="Search links" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search links…" className="h-9 w-full max-w-52 rounded-lg border border-stone-200 bg-white pl-9 pr-3 text-xs outline-none transition placeholder:text-stone-400 focus:border-forest focus:ring-2 focus:ring-forest/10" /></div><button onClick={() => setRevision((value) => value + 1)} disabled={loading} title="Refresh links and click counts" aria-label="Refresh links and click counts" className="rounded-lg border border-stone-200 p-2 text-stone-400 transition hover:bg-mint hover:text-forest disabled:opacity-50"><Icon name="refresh" className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button></div></div>

            <div className="overflow-x-auto">
              <table className={`w-full text-left ${view === "admin" ? "min-w-[880px]" : "min-w-[720px]"}`}>
                <thead><tr className="border-b border-stone-100 bg-[#fcfdfb] text-[9px] font-medium tracking-[1.15px] text-stone-400"><th scope="col" className="py-3.5 pl-6 pr-4 font-medium">SHORT LINK</th><th scope="col" className="px-4 py-3.5 font-medium">ORIGINAL URL</th>{view === "admin" && <th scope="col" className="px-4 font-medium">OWNER</th>}<th scope="col" className="px-4 py-3.5 font-medium">CLICKS</th><th scope="col" className="px-4 py-3.5 font-medium">CREATED</th>{view === "admin" && <th scope="col" className="px-4 font-medium">STATUS</th>}<th scope="col" className="py-3.5 pl-2 pr-5 text-right font-medium">ACTIONS</th></tr></thead>
                <tbody>
                  {loading ? Array.from({ length: 3 }, (_, index) => <tr key={index} aria-hidden="true" className="border-b border-stone-100"><td className="px-6 py-6"><div className="h-4 w-28 animate-pulse rounded bg-stone-100" /></td><td className="px-4"><div className="h-3 w-40 animate-pulse rounded bg-stone-100" /></td><td colSpan={view === "admin" ? 5 : 3} className="px-4"><div className="h-3 w-20 animate-pulse rounded bg-stone-100" /></td></tr>) : !listError && links?.items.map((link, index) => <tr key={link.id} className="border-b border-stone-100/80 transition last:border-b-0 hover:bg-canvas/60"><td className="py-5 pl-6 pr-4"><div className="flex items-center gap-3"><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${["bg-[#edf3e9] text-[#839675]", "bg-[#edf0f7] text-[#8492b0]", "bg-[#faf0e6] text-[#c29d73]", "bg-[#f3edf6] text-[#a291b0]", "bg-[#edf3f0] text-[#829d94]"][index % 5]}`}><Icon name="link" className="h-4 w-4" /></span><div className="min-w-0"><a href={link.short_url} target="_blank" rel="noreferrer" title={fullShortUrl(link)} className={`block max-w-52 truncate text-[12px] font-semibold hover:underline ${link.is_active ? "text-forest" : "text-stone-400"}`}>{fullShortUrl(link).replace(/^https?:\/\//, "")}</a><span className="mt-1 block text-[10px] text-stone-400">{domain(link.original_url)}</span></div></div></td><td className="max-w-60 px-4"><a href={link.original_url} target="_blank" rel="noreferrer" title={link.original_url} className="block max-w-56 truncate text-[11px] text-stone-500 hover:text-forest">{link.original_url}</a></td>{view === "admin" && <td className="max-w-24 truncate px-4 text-[11px] text-stone-500" title={link.owner}>{link.owner}</td>}<td className="px-4"><span className="inline-flex items-center gap-1.5 rounded-md bg-[#f6f7f4] px-2 py-1 text-[11px] text-stone-500"><Icon name="chart" className="h-3 w-3 text-stone-400" />{numberFormat.format(link.click_count)}</span></td><td className="whitespace-nowrap px-4 text-[10px] text-stone-400"><time dateTime={link.created_at} title={new Date(link.created_at).toLocaleString()}>{dateFormat.format(new Date(link.created_at))}</time></td>{view === "admin" && <td className="px-4"><span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[9px] font-medium ${link.is_active ? "bg-mint text-forest" : "bg-stone-100 text-stone-500"}`}><span className={`h-1 w-1 rounded-full ${link.is_active ? "bg-forest" : "bg-stone-400"}`} />{link.is_active ? "Active" : "Disabled"}</span></td>}<td className="pl-2 pr-5"><div className="flex items-center justify-end gap-1"><button onClick={() => void copy(link)} aria-label={`Copy short link ${link.short_code}`} title={copied === link.id ? "Copied!" : "Copy short link"} className="rounded-md p-1.5 text-stone-400 transition hover:bg-mint hover:text-forest"><Icon name={copied === link.id ? "check" : "copy"} className="h-3.5 w-3.5" /></button>{view === "admin" ? <button onClick={() => void toggleLink(link)} disabled={actionBusy === link.id} aria-label={`${link.is_active ? "Disable" : "Re-enable"} link ${link.short_code}`} title={link.is_active ? "Disable link" : "Re-enable link"} className={`rounded-md p-1.5 transition disabled:opacity-40 ${link.is_active ? "text-stone-400 hover:bg-amber-50 hover:text-amber-700" : "text-forest hover:bg-mint"}`}><Icon name={link.is_active ? "pause" : "play"} className="h-3.5 w-3.5" /></button> : user?.username === link.owner ? <button onClick={() => setDeleting(link)} aria-label={`Delete link ${link.short_code}`} title="Delete link" className="rounded-md p-1.5 text-stone-400 transition hover:bg-red-50 hover:text-red-600"><Icon name="trash" className="h-3.5 w-3.5" /></button> : <a href={link.short_url} target="_blank" rel="noreferrer" aria-label={`Open short link ${link.short_code}`} title="Open short link" className="rounded-md p-1.5 text-stone-400 transition hover:bg-mint hover:text-forest"><Icon name="external" className="h-3.5 w-3.5" /></a>}</div></td></tr>)}
                </tbody>
              </table>
            </div>

            {!loading && (listError || !links?.items.length) && <div className="flex min-h-[210px] flex-col items-center justify-center px-6 py-9 text-center"><div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-2xl ${listError ? "bg-red-50 text-red-400" : "bg-mint text-[#8fa185]"}`}><Icon name={listError ? "refresh" : query ? "search" : "link"} className="h-5 w-5" /></div><h3 className="text-sm font-medium">{listError ? "A little hiccup." : query ? "No links found." : view === "admin" ? "A clean slate." : "Your next great link starts here."}</h3><p className="mt-2 max-w-xs text-xs leading-5 text-stone-400">{listError || (query ? "Try a different search or clear your filters." : view === "admin" ? "Links will appear here as the community creates them." : "Drop a long URL in the box above. We'll take care of the little things.")}</p>{listError ? <button onClick={() => setRevision((value) => value + 1)} className="mt-4 text-xs font-semibold text-forest hover:underline">Try again</button> : query ? <button onClick={() => setSearch("")} className="mt-4 text-xs font-semibold text-forest hover:underline">Clear search</button> : !user && <button onClick={() => setAuthMode("register")} className="mt-4 flex items-center gap-2 text-xs font-semibold text-forest hover:underline">Create your first link<Icon name="arrow" className="h-3.5 w-3.5" /></button>}</div>}

            <div className="flex items-center justify-between gap-3 border-t border-stone-100 px-5 py-4 sm:px-6"><p className="text-[10px] text-stone-400">{loading ? "Loading links…" : links?.total ? <>Showing <span className="font-medium text-stone-500">{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, links.total)}</span> of <span className="font-medium text-stone-500">{numberFormat.format(links.total)}</span> links</> : "Nothing here yet. Something great is coming."}</p><div className="flex items-center gap-2"><button disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)} aria-label="Previous page" className="flex h-7 w-7 items-center justify-center rounded-md border border-stone-200 text-stone-400 transition hover:border-forest hover:text-forest disabled:opacity-35"><Icon name="left" className="h-3 w-3" /></button><span className="text-[10px] text-stone-400">{page} <span className="mx-1 text-stone-300">/</span> {totalPages}</span><button disabled={page >= totalPages || loading} onClick={() => setPage((value) => value + 1)} aria-label="Next page" className="flex h-7 w-7 items-center justify-center rounded-md border border-stone-200 text-stone-400 transition hover:border-forest hover:text-forest disabled:opacity-35"><Icon name="right" className="h-3 w-3" /></button></div></div>
          </section>

          <footer className="mt-7 flex items-center justify-between gap-4 text-[10px] text-stone-400"><p className="flex items-center gap-1.5"><Icon name="link" className="h-3 w-3 text-[#99aa8f]" />Made for sharing. Built to be simple.</p><span className="hidden sm:block">A little link goes a long way.</span></footer>
        </main>
      </div>

      {authMode && <AuthDialog initialMode={authMode} onClose={() => setAuthMode(null)} onAuthenticated={(nextToken, nextUser) => { saveToken(nextToken); setToken(nextToken); setUser(nextUser); setAuthMode(null); setToast({ message: `You're all set, ${nextUser.username}. Let's make something short.` }); }} />}
      {deleting && <Modal title="Let this little link go?" onClose={() => { if (actionBusy === null) setDeleting(null); }}><p className="mb-5 mt-3 text-sm leading-6 text-stone-500">This will permanently delete your link and its click history. Anyone with the short address will no longer be redirected.</p><p className="break-all rounded-xl bg-canvas px-4 py-3 text-xs font-medium text-forest">{fullShortUrl(deleting)}</p><div className="mt-6 flex justify-end gap-3"><button disabled={actionBusy !== null} onClick={() => setDeleting(null)} className="rounded-xl border border-stone-200 px-4 py-3 text-xs font-medium text-stone-500">Keep link</button><button disabled={actionBusy !== null} onClick={() => void deleteLink()} className="rounded-xl bg-red-600 px-4 py-3 text-xs font-medium text-white transition hover:bg-red-700 disabled:opacity-60">{actionBusy !== null ? "Deleting…" : "Delete permanently"}</button></div></Modal>}
      {showHelp && <Modal title="A little link. Three little steps." onClose={() => setShowHelp(false)}><div className="mb-5 mt-6 space-y-6">{[{ title: "Make yourself at home", text: "Create an account or sign in. Your links stay connected to you." }, { title: "Keep it short", text: "Paste any http or https address and hit Shorten link. Your original destination stays the same." }, { title: "Share something good", text: "Copy your new short address. Every visit redirects to the original URL and counts as a click." }].map((step, index) => <div key={step.title} className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-mint text-xs font-semibold text-forest">{index + 1}</span><div><h3 className="text-sm font-medium">{step.title}</h3><p className="mt-1 text-xs leading-5 text-stone-500">{step.text}</p></div></div>)}</div><p className="border-t border-stone-100 pt-4 text-xs leading-5 text-stone-400">Only you can delete your links. An administrator can disable links to keep the community safe.</p></Modal>}
      {toast && <div role={toast.error ? "alert" : "status"} className={`fixed bottom-6 left-5 right-5 z-50 mx-auto flex w-fit max-w-[calc(100%-2.5rem)] items-center gap-3 rounded-xl border bg-white px-5 py-3.5 text-xs shadow-lg sm:left-auto sm:right-8 ${toast.error ? "border-red-100 text-red-700" : "border-[#dae5d6] text-forest"}`}><Icon name={toast.error ? "x" : "check"} className="h-4 w-4 shrink-0" />{toast.message}<button aria-label="Dismiss notification" onClick={() => setToast(null)} className="ml-1 rounded p-1 text-stone-400 hover:text-ink"><Icon name="x" className="h-3 w-3" /></button></div>}
    </div>
  );
}

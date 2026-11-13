import { useCallback, useEffect, useState } from "react";
import { api, readSession, storeSession } from "./api";
import type { NotePage as NotePageData, Session, Tag } from "./api";
import { NavigationContext } from "./navigation";
import type { Navigate } from "./navigation";
import AuthModal from "./AuthModal";
import Icon from "./Icons";
import Link from "./Link";
import NoteEditor from "./NoteEditor";
import NotePage from "./NotePage";
import NotesList from "./NotesList";

export default function App() {
  const [route, setRoute] = useState(window.location.pathname + window.location.search);
  const [session, setSession] = useState<Session | null>(readSession);
  const [authMode, setAuthMode] = useState<"login" | "register" | null>(null);
  const [afterAuth, setAfterAuth] = useState<string | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [tagError, setTagError] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [toast, setToast] = useState("");
  const [signingOut, setSigningOut] = useState(false);

  const navigate = useCallback<Navigate>((href, options = {}) => {
    if (options.replace) window.history.replaceState(null, "", href);
    else if (href !== window.location.pathname + window.location.search) window.history.pushState(null, "", href);
    setRoute(window.location.pathname + window.location.search);
    setMobileSidebar(false);
    if (options.scroll !== false) window.scrollTo({ top: 0, behavior: "instant" });
  }, []);

  useEffect(() => {
    function back() { setRoute(window.location.pathname + window.location.search); setMobileSidebar(false); }
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setTagError(false);
    api<{ items: Tag[] }>("/tags", { signal: controller.signal }).then(data => setTags(data.items)).catch(() => { if (!controller.signal.aborted) setTagError(true); });
    api<NotePageData>("/notes?page_size=1", { signal: controller.signal }).then(data => setTotal(data.total)).catch(() => {});
    return () => controller.abort();
  }, [refresh]);

  useEffect(() => {
    function expired() {
      setSession(null);
      storeSession(null);
      setToast("Your session has expired. Sign in to keep writing.");
    }
    window.addEventListener("session-expired", expired);
    return () => window.removeEventListener("session-expired", expired);
  }, []);

  useEffect(() => {
    if (!session) return;
    const controller = new AbortController();
    api<{ username: string }>("/auth/me", { token: session.token, signal: controller.signal }).catch(() => {});
    return () => controller.abort();
  }, [session]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 5000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const [pathname, query = ""] = route.split("?");
  const params = new URLSearchParams(query);
  const activeTag = pathname === "/" ? params.get("tag") : null;
  const ownNotes = !!session && pathname === "/" && params.get("author") === session.username;
  const noteMatch = pathname.match(/^\/notes\/(\d+)(\/edit)?\/?$/);

  function newNote() {
    if (session) navigate("/new");
    else { setAfterAuth("/new"); setAuthMode("login"); }
  }

  function filterTag(tag: string) {
    const next = new URLSearchParams(pathname === "/" ? query : "");
    if (tag === activeTag) next.delete("tag");
    else next.set("tag", tag);
    next.delete("page");
    navigate(next.size ? `/?${next}` : "/", { scroll: pathname !== "/" });
  }

  async function signOut() {
    if (!session) return;
    setSigningOut(true);
    try {
      await api("/auth/logout", { method: "POST", token: session.token });
    } catch {
      setToast("Signed out on this device.");
    } finally {
      setSession(null);
      storeSession(null);
      setSigningOut(false);
      if (pathname === "/new" || pathname.endsWith("/edit")) navigate("/");
    }
  }

  return (
    <NavigationContext.Provider value={navigate}>
      <div className="min-h-dvh">
        <header className="sticky top-0 z-30 flex h-[76px] items-center justify-between border-b border-line bg-paper/95 px-5 backdrop-blur-md sm:px-8 lg:px-9">
          <div className="flex items-center gap-3"><button aria-label={mobileSidebar ? "Close navigation" : "Open navigation"} aria-expanded={mobileSidebar} onClick={() => setMobileSidebar(!mobileSidebar)} className="rounded-lg p-1.5 text-moss lg:hidden"><Icon name={mobileSidebar ? "close" : "menu"} className="size-5" /></button><Link href="/" className="flex items-center gap-2.5"><span className="flex size-9 items-center justify-center rounded-[10px] bg-moss text-[#e9efdc]"><Icon name="book" className="size-[21px]" /></span><span className="font-serif text-[26px] tracking-[-0.06em]">marginalia<span className="text-[#91a474]">.</span></span></Link><span className="ml-5 hidden border-l border-line pl-5 text-[10px] tracking-wide text-muted md:block">Room for a little thought.</span></div>
          <div className="flex items-center gap-4 sm:gap-6">{session ? <><span className="flex items-center gap-2 text-xs"><span className="flex size-7 items-center justify-center rounded-full border border-moss/10 bg-leaf text-[10px] font-medium uppercase">{session.username.slice(0, 1)}</span><span className="max-w-24 truncate sm:max-w-40">{session.username}</span></span><button onClick={signOut} disabled={signingOut} className="flex items-center gap-1.5 text-[11px] text-muted transition hover:text-ink"><span className="hidden sm:block">{signingOut ? "Signing out…" : "Sign out"}</span><Icon name="logout" className="size-4" /><span className="sr-only sm:hidden">Sign out</span></button></> : <><button onClick={() => { setAfterAuth(null); setAuthMode("login"); }} className="text-xs text-moss transition hover:text-muted">Sign in</button><button onClick={() => { setAfterAuth(null); setAuthMode("register"); }} className="hidden items-center gap-2 rounded-lg border border-moss/20 bg-white/50 px-3.5 py-2.5 text-xs font-medium transition hover:bg-leaf sm:flex">Create account<Icon name="arrow" className="size-3.5" /></button></>}</div>
        </header>

        {mobileSidebar && <button aria-label="Close navigation" onClick={() => setMobileSidebar(false)} className="fixed inset-x-0 bottom-0 top-[76px] z-30 bg-ink/20 backdrop-blur-[2px] lg:hidden" />}
        <aside className={`fixed bottom-0 left-0 top-[76px] z-40 flex w-[244px] flex-col overflow-y-auto border-r border-line bg-[#f2f4ee] px-6 pb-6 pt-8 transition-transform lg:z-20 lg:translate-x-0 ${mobileSidebar ? "translate-x-0" : "-translate-x-full"}`}>
          <p className="mb-3 px-3 text-[9px] font-semibold uppercase tracking-[0.18em] text-muted">Your corner of the world</p>
          <nav aria-label="Main navigation" className="space-y-1">
            <Link href="/" aria-current={pathname === "/" && !ownNotes && !activeTag ? "page" : undefined} className={`flex items-center justify-between rounded-lg px-3 py-3 text-xs transition ${pathname === "/" && !ownNotes && !activeTag ? "bg-[#e3e9d7] font-medium text-moss" : "text-muted hover:bg-leaf"}`}><span className="flex items-center gap-3"><Icon name="notes" className="size-4" />All notes</span><span className="rounded bg-white/60 px-1.5 py-0.5 text-[10px]">{total ?? "—"}</span></Link>
            <button onClick={() => { if (session) navigate(`/?author=${encodeURIComponent(session.username)}`); else { setAfterAuth("my-notes"); setAuthMode("login"); } }} aria-current={ownNotes ? "page" : undefined} className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-xs transition ${ownNotes ? "bg-[#e3e9d7] font-medium text-moss" : "text-muted hover:bg-leaf"}`}><Icon name="user" className="size-4" />My notes</button>
          </nav>
          <div className="mb-6 mt-7 h-px bg-line" />
          <div className="mb-4 flex items-center justify-between px-3"><h2 className="text-[9px] font-semibold uppercase tracking-[0.18em] text-muted">Explore by tag</h2><Icon name="tag" className="size-3.5 text-muted/65" /></div>
          <div className="flex flex-wrap gap-2 px-2" aria-label="Tag cloud">{tags.map(({ tag, count }) => <button key={tag} onClick={() => filterTag(tag)} aria-pressed={activeTag === tag} className={`flex max-w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-[10px] transition ${activeTag === tag ? "border-moss bg-moss text-white" : "border-[#e0e4d8] bg-white/55 text-[#737e67] hover:border-[#9ba88d] hover:bg-white"}`}><span className="truncate">#{tag}</span><span className={`text-[9px] ${activeTag === tag ? "text-white/60" : "text-[#a0a994]"}`}>{count}</span></button>)}</div>
          {tagError ? <div className="px-3 text-[11px] leading-5 text-muted">Couldn’t load tags.<button onClick={() => setRefresh(value => value + 1)} className="ml-1 underline underline-offset-3">Retry</button></div> : !tags.length && <div className="px-3"><p className="text-[11px] leading-5 text-muted">A little order goes a long way.</p><p className="mt-2 text-[10px] leading-5 text-muted/75">Tags will find their home here when the first notes arrive.</p><div aria-hidden="true" className="mt-4 flex flex-wrap gap-1.5">{["ideas", "everyday", "inspiration"].map(tag => <span key={tag} className="rounded-md border border-dashed border-[#d9dfce] px-2 py-1 text-[10px] text-[#a2ac94]">#{tag}</span>)}</div></div>}
          <div className="mt-auto pt-12">
            <div className="relative rounded-xl border border-[#dce3cc] bg-[#eaf0dd] p-4"><Icon name="sparkle" className="mb-3 size-5 text-[#829369]" /><p className="font-serif text-[20px] leading-[1.3] tracking-tight">Ideas are better<br />when they’re shared.</p><p className="mt-3 text-[10px] leading-[1.8] text-[#89937c]">Leave a thought. Find a spark.<br />See where it takes you.</p><button onClick={newNote} className="mt-4 flex items-center gap-2 text-[10px] font-medium text-moss hover:underline">Make your mark<Icon name="arrow" className="size-3" /></button></div>
            <div className="mt-5 flex items-center gap-2 px-1 text-[10px] text-muted"><Icon name="globe" className="size-3.5" /><span>Open pages. Open minds.</span></div>
          </div>
        </aside>

        <main className="px-5 pb-8 pt-9 sm:px-9 sm:pt-10 lg:ml-[244px] lg:px-11 xl:px-14">
          <div className="mx-auto max-w-[1120px]">
            {pathname === "/" ? <NotesList query={query} refresh={refresh} navigate={navigate} session={session} onNew={newNote} /> : pathname === "/new" ? session ? <NoteEditor session={session} onSave={note => { setRefresh(value => value + 1); setToast("Note published. A new thought in the world."); navigate(`/notes/${note.id}`); }} onCancel={() => navigate("/")} /> : <div className="mx-auto max-w-lg rounded-xl border border-line bg-white p-12 text-center"><Icon name="edit" className="mx-auto mb-5 size-8 text-moss/60" /><h1 className="font-serif text-3xl">A page of your own.</h1><p className="mt-4 text-sm text-muted">Sign in to start writing. Your thoughts are welcome here.</p><button onClick={newNote} className="mt-6 rounded-lg bg-moss px-5 py-3 text-xs text-white hover:bg-ink">Sign in to write</button></div> : noteMatch ? <NotePage key={noteMatch[1]} id={Number(noteMatch[1])} editing={!!noteMatch[2]} session={session} navigate={navigate} onChanged={() => setRefresh(value => value + 1)} notify={setToast} /> : <div className="rounded-xl border border-line bg-white p-12 text-center"><h1 className="font-serif text-3xl">An unwritten page.</h1><p className="mt-4 text-sm text-muted">There’s nothing at this address.</p><Link href="/" className="mt-6 inline-block text-xs underline underline-offset-4">Back to the notebook</Link></div>}
            <footer className="mt-10 flex items-center justify-between gap-4 border-t border-line pt-5 text-[9px] text-[#9ca294]"><span>Made for thoughts, not distractions.</span><span className="flex items-center gap-1.5"><Icon name="book" className="size-3" />Marginalia<span className="hidden sm:inline">— a little space for your mind.</span></span></footer>
          </div>
        </main>

        {authMode && <AuthModal initialMode={authMode} onClose={() => { setAuthMode(null); setAfterAuth(null); }} onSuccess={value => { setSession(value); storeSession(value); setAuthMode(null); setToast(`Welcome, ${value.username}. Make yourself at home.`); if (afterAuth) navigate(afterAuth === "my-notes" ? `/?author=${encodeURIComponent(value.username)}` : afterAuth); setAfterAuth(null); }} />}
        {toast && <div role="status" className="fixed bottom-5 left-5 right-5 z-50 mx-auto flex w-fit max-w-[calc(100%-2.5rem)] items-center gap-4 rounded-xl border border-line bg-white px-5 py-4 text-xs text-moss shadow-lg sm:left-auto sm:right-6 sm:max-w-md"><Icon name="book" className="size-4 shrink-0" /><span>{toast}</span><button onClick={() => setToast("")} aria-label="Dismiss notification" className="rounded p-1 text-muted hover:text-ink"><Icon name="close" className="size-3.5" /></button></div>}
      </div>
    </NavigationContext.Provider>
  );
}

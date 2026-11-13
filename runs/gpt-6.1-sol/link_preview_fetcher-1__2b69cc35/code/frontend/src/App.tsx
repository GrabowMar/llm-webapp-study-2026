import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, ArrowUpRight, Bookmark, Check, ChevronRight, CircleHelp, Globe2, Leaf, Link2, LoaderCircle, LogOut, Menu, Plus, ShieldCheck, Sparkles, X } from "lucide-react";
import { api, ApiError, getStoredToken, storeToken, type Session } from "./api";
import AuthDialog from "./components/AuthDialog";
import Dialog from "./components/Dialog";
import Inspiration from "./components/Inspiration";
import Library from "./components/Library";

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [restoring, setRestoring] = useState(() => Boolean(getStoredToken()));
  const [restoreError, setRestoreError] = useState("");
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const [authMode, setAuthMode] = useState<"login" | "register" | null>(null);
  const [info, setInfo] = useState<"how" | "about" | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [url, setUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const [revision, setRevision] = useState(0);
  const [total, setTotal] = useState(0);
  const [notice, setNotice] = useState("");
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) { setRestoring(false); return; }
    const controller = new AbortController();
    setRestoring(true);
    setRestoreError("");
    api<{ username: string }>("/auth/me", { token, signal: controller.signal }).then((user) => {
      setSession({ token, username: user.username });
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      if (error instanceof ApiError && error.status === 401) storeToken(null);
      else setRestoreError(error instanceof Error ? error.message : "Unable to restore your session.");
    }).finally(() => {
      if (!controller.signal.aborted) setRestoring(false);
    });
    return () => controller.abort();
  }, [restoreAttempt]);

  useEffect(() => {
    function expired() {
      storeToken(null);
      setSession(null);
      setTotal(0);
      setNotice("Your session has expired. Sign in to return to your library.");
    }
    window.addEventListener("session-expired", expired);
    return () => window.removeEventListener("session-expired", expired);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 6000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  async function addLink(event: FormEvent) {
    event.preventDefault();
    if (adding || restoring) return;
    setAddError("");
    let candidate = url.trim();
    if (!candidate) { setAddError("Paste a link to get started."); return; }
    if (!/^[a-z][a-z\d+.-]*:/i.test(candidate)) candidate = `https://${candidate}`;
    try {
      const parsed = new URL(candidate);
      if (!["https:", "http:"].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) throw new Error();
    } catch {
      setAddError("That doesn't look like a web link. Try an HTTP or HTTPS URL.");
      return;
    }
    if (!session) { setAuthMode("register"); return; }
    setAdding(true);
    try {
      await api("/previews", { token: session.token, method: "POST", body: { url: candidate } });
      setUrl("");
      setRevision((current) => current + 1);
      setNotice("A good find, safely tucked away.");
    } catch (error) {
      setAddError(error instanceof Error ? error.message : "Unable to save this link.");
    } finally {
      setAdding(false);
    }
  }

  async function signOut() {
    if (!session || signingOut) return;
    setSigningOut(true);
    try {
      await api("/auth/logout", { token: session.token, method: "POST" });
      storeToken(null);
      setSession(null);
      setTotal(0);
      setNotice("Signed out. Your links will be here when you're back.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not sign out. Please try again.");
    } finally {
      setSigningOut(false);
    }
  }

  const navigation = (
    <>
      <a href="/" aria-label="Marginal home" className="flex items-center gap-2.5 px-2"><span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-olive text-white"><Bookmark size={21} fill="currentColor" strokeWidth={1.5} /></span><span className="font-serif text-[31px] tracking-[-1.3px]">marginal<span className="text-olive">.</span></span></a>
      <p className="mt-3 pl-2 text-[11px] text-muted">Good links. A little breathing room.</p>
      <nav aria-label="Main navigation" className="mt-14">
        <p className="mb-4 px-3 text-[9px] font-medium tracking-[0.18em] text-muted">YOUR SPACE</p>
        <button onClick={() => { setMobileNav(false); document.getElementById("library-section")?.scrollIntoView({ behavior: "smooth" }); }} className="flex w-full items-center gap-3 rounded-lg bg-[#e7ecde] px-3.5 py-3 text-[13px] font-medium text-olive"><Bookmark size={17} /><span>All links</span><span className="ml-auto rounded-md bg-white/65 px-2 py-0.5 text-[10px]">{session ? total : "—"}</span></button>
        <button onClick={() => { setInfo("how"); setMobileNav(false); }} className="mt-2 flex w-full items-center gap-3 rounded-lg px-3.5 py-3 text-[13px] text-muted hover:bg-line/50 hover:text-ink"><CircleHelp size={17} />How it works<ArrowUpRight size={13} className="ml-auto" /></button>
      </nav>
      <div className="mt-auto pt-20">
        <div className="relative overflow-hidden rounded-xl border border-[#e0e5d7] bg-[#edf0e5] p-5">
          <Leaf size={22} strokeWidth={1.2} className="mb-4 text-olive" />
          <p className="font-serif text-[20px] leading-[1.35] tracking-[-0.3px]">Less scrolling.<br />More discovering.</p>
          <p className="mt-3 text-[11px] leading-[1.8] text-muted">Make a little space for the things that inspire you.</p>
          <svg aria-hidden="true" viewBox="0 0 80 110" className="absolute -bottom-4 -right-4 h-28 w-20 rotate-[-20deg] text-olive/15" fill="none" stroke="currentColor" strokeWidth="2"><path d="M45 110V22M45 55C11 55 9 24 9 24s36 0 36 31zm0 29c30 0 31-30 31-30s-30 0-31 30z" /></svg>
        </div>
        <button onClick={() => { setInfo("about"); setMobileNav(false); }} className="mt-7 flex items-center gap-2 px-2 text-[11px] text-muted hover:text-olive"><span className="h-1.5 w-1.5 rounded-full bg-olive/60" />A calmer corner of the internet<ChevronRight size={12} /></button>
        <p className="mt-4 px-2 text-[10px] text-muted/65">Made for curious minds.</p>
      </div>
    </>
  );

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[244px] flex-col border-r border-line bg-sidebar px-6 pb-7 pt-9 lg:flex">{navigation}</aside>
      {mobileNav && <div className="fixed inset-0 z-40 bg-ink/25 lg:hidden" onMouseDown={(event) => { if (event.currentTarget === event.target) setMobileNav(false); }}><aside className="relative flex h-full w-[270px] flex-col overflow-y-auto border-r border-line bg-sidebar px-6 pb-7 pt-9"><button aria-label="Close menu" onClick={() => setMobileNav(false)} className="absolute right-3 top-3 rounded p-1 text-muted"><X size={18} /></button>{navigation}</aside></div>}
      <div className="lg:ml-[244px]">
        <header className="flex h-[83px] items-center justify-between gap-4 border-b border-line px-5 sm:px-9 xl:px-12">
          <div className="flex items-center gap-3"><button aria-label="Open menu" onClick={() => setMobileNav(true)} className="rounded-lg p-1.5 text-muted lg:hidden"><Menu size={20} /></button><span className="font-serif text-2xl tracking-tight lg:hidden">marginal.</span><span className="hidden items-center gap-2 text-[11px] text-muted lg:flex"><Bookmark size={13} strokeWidth={1.5} />Your personal link library</span></div>
          {restoring ? <span role="status" className="flex items-center gap-2 text-xs text-muted"><LoaderCircle size={15} className="animate-spin motion-reduce:animate-none" />Opening your library…</span> : session ? (
            <div className="flex items-center gap-3 sm:gap-5"><span className="flex items-center gap-2.5"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#e7ecde] font-serif text-sm text-olive">{session.username.slice(0, 1).toUpperCase()}</span><span className="max-w-28 truncate text-xs font-medium sm:max-w-48">{session.username}</span></span><span className="h-5 w-px bg-line" /><button aria-label="Sign out" disabled={signingOut} onClick={() => void signOut()} className="flex items-center gap-2 rounded-md p-1 text-xs text-muted hover:text-ink disabled:opacity-50">{signingOut ? <LoaderCircle size={14} className="animate-spin motion-reduce:animate-none" /> : <LogOut size={14} />}<span className="hidden sm:inline">Sign out</span></button></div>
          ) : (
            <div className="flex items-center gap-4 sm:gap-6"><button onClick={() => setAuthMode("login")} className="rounded text-xs text-muted hover:text-ink">Sign in</button><button onClick={() => setAuthMode("register")} className="flex items-center gap-2 rounded-lg bg-olive px-3.5 py-2.5 text-xs font-medium text-white transition hover:bg-olive/90">Make it yours<ArrowRight size={14} className="hidden sm:block" /></button></div>
          )}
        </header>
        <main className="mx-auto max-w-[1320px] px-5 pb-8 pt-9 sm:px-9 sm:pt-11 xl:px-12">
          {restoreError && <div role="alert" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800"><span>{restoreError}</span><button onClick={() => setRestoreAttempt((current) => current + 1)} className="rounded font-medium underline underline-offset-2">Retry session</button></div>}
          <section className="relative flex items-center justify-between gap-5" aria-labelledby="welcome-heading">
            <div className="relative z-10">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e1e7d6] bg-[#f0f3e9] px-2.5 py-1 text-[10px] text-olive"><Sparkles size={11} />A home for your good finds</span>
              <h1 id="welcome-heading" className="mt-5 font-serif text-[39px] leading-[1.12] tracking-[-1.7px] sm:text-[49px] xl:text-[54px]">Good links deserve<br />a place to live<span className="text-accent">.</span></h1>
              <p className="mt-4 max-w-md text-[13px] leading-[1.9] text-muted">Save what catches your eye. Come back when you're curious.<br className="hidden sm:block" /> Your little corner of the internet, all in one place.</p>
            </div>
            <img src="/illustration.svg" alt="" className="mr-1 hidden w-[240px] shrink-0 lg:block xl:mr-5 xl:w-[285px]" />
          </section>
          <section aria-label="Save a new link" className="mb-11 mt-9">
            <form onSubmit={addLink} className="flex items-center gap-2 rounded-xl border border-line bg-white p-2 shadow-[0_3px_10px_-5px_rgba(47,53,41,0.12)] sm:gap-3 sm:p-2.5">
              <Link2 size={19} className="ml-2 shrink-0 text-muted/70 sm:ml-3" strokeWidth={1.7} />
              <input id="link-url" aria-label="Link to save" aria-describedby={addError ? "add-error" : "add-hint"} inputMode="url" autoComplete="url" value={url} onChange={(event) => { setUrl(event.target.value); if (addError) setAddError(""); }} disabled={adding || restoring} placeholder="Paste a link to keep for later…" className="min-w-0 flex-1 rounded-md bg-transparent px-1 py-2 text-[13px] placeholder:text-muted/70 disabled:opacity-50" />
              <button disabled={adding || restoring} className="flex min-w-[89px] items-center justify-center gap-2 rounded-lg bg-accent px-4 py-3 text-[12px] font-medium text-white transition hover:bg-[#cc694b] disabled:opacity-60 sm:min-w-[110px] sm:px-5">{adding ? <LoaderCircle size={16} className="animate-spin motion-reduce:animate-none" /> : <Plus size={17} />}{adding ? "Saving…" : "Add link"}</button>
            </form>
            {addError ? <p id="add-error" role="alert" className="mt-3 text-xs text-red-700">{addError}</p> : <p id="add-hint" className="mt-3 flex items-center gap-1.5 pl-1 text-[10px] text-muted/80">{adding ? <><LoaderCircle size={11} className="animate-spin motion-reduce:animate-none" />Fetching the page and putting together your preview…</> : <><ShieldCheck size={11} />{session ? "Just paste a URL. We'll take care of the preview." : "Your links stay private. Create a free account to start collecting."}</>}</p>}
          </section>
          <div id="library-section" className="scroll-mt-8">
            {session ? <Library key={session.token} session={session} revision={revision} onTotal={setTotal} notify={setNotice} /> : (
              <section aria-labelledby="inspiration-heading">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><h2 id="inspiration-heading" className="text-[17px] font-semibold tracking-tight">A little inspiration</h2><span className="rounded-md border border-line bg-sidebar px-2 py-0.5 text-[9px] tracking-wide text-muted">A PEEK INSIDE</span></div><span className="flex items-center gap-1.5 text-[10px] text-muted"><Globe2 size={12} />A big world of good finds</span></div>
                <p className="mb-5 text-[11px] text-muted">The kind of links you'll be glad you kept. Here's how they'll look in your library.</p>
                <Inspiration />
                <div className="mt-7 flex flex-col items-start justify-between gap-4 rounded-xl border border-[#e2e7da] bg-[#f0f3e9] px-6 py-5 sm:flex-row sm:items-center"><div className="flex items-center gap-4"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/80 text-olive"><Bookmark size={19} strokeWidth={1.5} /></span><div><h3 className="font-serif text-xl tracking-tight">Your next good find belongs here.</h3><p className="mt-1 text-[11px] text-muted">Start a collection that's a little more you.</p></div></div><button onClick={() => setAuthMode("register")} className="flex shrink-0 items-center gap-2 rounded-lg border border-olive/20 bg-white px-4 py-2.5 text-[11px] font-medium text-olive transition hover:bg-olive hover:text-white">Create your library<ArrowRight size={14} /></button></div>
              </section>
            )}
          </div>
          <footer className="mt-10 flex items-center justify-between gap-4 border-t border-line pt-5 text-[10px] text-muted/75"><span className="flex items-center gap-1.5"><Leaf size={12} strokeWidth={1.4} />Collected with curiosity.</span><span>A little less lost in the tabs.</span></footer>
        </main>
      </div>
      {authMode && <AuthDialog key={authMode} initialMode={authMode} onClose={() => setAuthMode(null)} onSession={(next) => {
        storeToken(next.token);
        setSession(next);
        setRestoreError("");
        setAuthMode(null);
        setNotice(url.trim() ? "You're in. Add your link to make your first good find." : "Welcome to your own little corner of the internet.");
      }} />}
      {info && <Dialog title={info === "how" ? "A link. A preview. A keeper." : "A little more intentional."} onClose={() => setInfo(null)}>
        {info === "how" ? <div className="mt-6 space-y-6">{[
          ["01", "Find something good", "An article, a handy resource, or an idea you don't want to lose. Copy its web link."],
          ["02", "Give it a home", "Paste the link and hit Add. We'll fetch the page's title, description, and image to build a little preview."],
          ["03", "Come back, whenever", "Your library is private and saved between visits. Open a link, refresh its preview, or let it go when you're done."],
        ].map(([number, title, text]) => <div key={number} className="flex gap-4"><span className="pt-1 font-serif text-xl text-olive/70">{number}</span><div><h3 className="text-sm font-medium">{title}</h3><p className="mt-2 text-xs leading-[1.8] text-muted">{text}</p></div></div>)}</div> : <div className="mt-5 space-y-4 text-sm leading-[1.9] text-muted"><p>The internet is full of wonderful things. It's also full of tabs you meant to come back to.</p><p>Marginal is a simple, quiet place to keep the links that matter to you. No feed, no followers, no noise. Just your curiosity, neatly collected.</p><p className="flex items-center gap-2 border-t border-line pt-4 text-xs text-olive"><ShieldCheck size={15} />Only you can see and change your saved links.</p></div>}
        {!session && <button onClick={() => { setInfo(null); setAuthMode("register"); }} className="mt-7 flex w-full items-center justify-center gap-2 rounded-lg bg-olive px-5 py-3 text-sm text-white hover:bg-olive/90">Make it yours<ArrowRight size={15} /></button>}
      </Dialog>}
      {notice && <div role="status" className="fixed bottom-5 left-5 right-5 z-[60] mx-auto flex w-fit max-w-[calc(100%-40px)] items-center gap-3 rounded-xl border border-line bg-white px-4 py-3 text-xs shadow-lg"><Check size={16} className="shrink-0 text-olive" /><span className="max-w-md leading-relaxed">{notice}</span><button aria-label="Dismiss notification" onClick={() => setNotice("")} className="shrink-0 rounded p-1 text-muted hover:text-ink"><X size={14} /></button></div>}
    </div>
  );
}

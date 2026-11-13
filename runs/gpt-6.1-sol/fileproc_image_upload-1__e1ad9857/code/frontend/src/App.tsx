import { useEffect, useRef, useState } from "react";
import { Aperture, ArrowDown, ArrowRight, ArrowUpRight, Check, ChevronLeft, ChevronRight, Globe2, Grid2X2, Heart, ImagePlus, Images, LayoutGrid, Leaf, LoaderCircle, LogOut, Search, Sparkles, UserRound, X } from "lucide-react";
import { api, formatDate, readToken, saveToken, type GalleryImage, type ImagePage, type Session } from "./api";
import Modal from "./components/Modal";
import Landscape from "./components/Landscape";
import AuthForm from "./components/AuthForm";
import UploadForm from "./components/UploadForm";
import ImageViewer from "./components/ImageViewer";

type Dialog = "login" | "register" | "upload" | "about" | null;

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [checkingSession, setCheckingSession] = useState(Boolean(readToken()));
  const [dialog, setDialog] = useState<Dialog>(null);
  const [selected, setSelected] = useState<GalleryImage | null>(null);
  const [result, setResult] = useState<ImagePage>({ items: [], total: 0, page: 1, page_size: 12 });
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [mine, setMine] = useState(false);
  const [compact, setCompact] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [notice, setNotice] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const gallery = useRef<HTMLElement>(null);
  const uploadAfterLogin = useRef(false);
  const uploader = mine ? session?.username : undefined;

  useEffect(() => {
    const token = readToken();
    if (!token) return;
    const controller = new AbortController();
    api<{ username: string }>("/auth/me", { signal: controller.signal }, token)
      .then((user) => setSession({ token, username: user.username }))
      .catch((error) => { if (error.name !== "AbortError") saveToken(null); })
      .finally(() => { if (!controller.signal.aborted) setCheckingSession(false); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    function expired() {
      saveToken(null);
      setSession(null);
      setMine(false);
      setNotice("Your session has expired. Please sign in again.");
    }
    window.addEventListener("folio:session-expired", expired);
    return () => window.removeEventListener("folio:session-expired", expired);
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => { setSearch(query.trim()); setPage(1); }, 300);
    return () => window.clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ page: String(page), page_size: "12" });
    if (search) params.set("q", search);
    if (uploader) params.set("uploader", uploader);
    api<ImagePage>(`/images?${params}`, { signal: controller.signal })
      .then((data) => {
        if (page > 1 && data.items.length === 0 && data.total > 0) setPage(Math.ceil(data.total / 12));
        else if (page > 1 && data.total === 0) setPage(1);
        else setResult(data);
      })
      .catch((error) => { if (error.name !== "AbortError") setError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page, search, uploader, refresh]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 5500);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  function scrollToGallery() {
    gallery.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function openUpload() {
    if (session) setDialog("upload");
    else { uploadAfterLogin.current = true; setDialog("login"); }
  }

  function signedIn(user: Session) {
    saveToken(user.token);
    setSession(user);
    setDialog(uploadAfterLogin.current ? "upload" : null);
    uploadAfterLogin.current = false;
    setNotice(`Welcome to your little space, ${user.username}.`);
  }

  async function signOut() {
    if (!session) return;
    setSigningOut(true);
    try {
      await api("/auth/logout", { method: "POST" }, session.token);
      saveToken(null);
      setSession(null);
      setMine(false);
      setPage(1);
      setNotice("You’re signed out. Stay a while and explore.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to sign out. Try again.");
    } finally { setSigningOut(false); }
  }

  function closeDialog() {
    setDialog(null);
    uploadAfterLogin.current = false;
  }

  const totalPages = Math.max(1, Math.ceil(result.total / 12));
  const filtered = Boolean(search || mine);

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-paper/95">
        <div className="mx-auto flex h-20 max-w-[1320px] items-center justify-between gap-5 px-5 sm:px-8 lg:px-14">
          <a href="/" aria-label="Folio home" className="flex items-center gap-2.5"><Aperture size={31} className="text-accent" strokeWidth={1.7} /><span className="text-[30px] font-semibold tracking-[-1.8px]">folio<span className="text-accent">.</span></span></a>
          <nav className="ml-10 hidden h-full items-center gap-8 md:flex" aria-label="Main navigation"><button onClick={scrollToGallery} className="relative flex h-full items-center text-[13px] font-semibold after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-accent">Discover</button><button onClick={() => setDialog("about")} className="text-[13px] text-muted transition hover:text-ink">Our little space <ArrowUpRight size={12} className="ml-1 inline" /></button></nav>
          <div className="ml-auto flex items-center gap-3 sm:gap-5">
            {checkingSession ? <LoaderCircle size={19} className="animate-spin text-muted" /> : session ? <><span className="flex max-w-44 items-center gap-2 text-xs font-medium sm:text-sm"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#e9ecdf] text-[#64744e]"><UserRound size={15} /></span><span className="max-w-24 truncate sm:max-w-36">{session.username}</span></span><button onClick={signOut} disabled={signingOut} className="flex items-center gap-1.5 text-xs text-muted hover:text-ink" aria-label="Sign out">{signingOut ? <LoaderCircle size={15} className="animate-spin" /> : <LogOut size={15} />}<span className="hidden sm:inline">Sign out</span></button></> : <><button onClick={() => setDialog("login")} className="text-[13px] font-medium hover:text-accent">Sign in</button><button onClick={() => setDialog("register")} className="button-secondary px-3 py-2 text-xs sm:px-4 sm:text-[13px]">Join Folio <ArrowUpRight size={14} className="hidden sm:block" /></button></>}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1320px] px-5 pb-16 pt-10 sm:px-8 sm:pt-12 lg:px-14">
        <section className="mb-9 flex flex-col justify-between gap-7 md:flex-row md:items-end lg:mb-10">
          <div><p className="mb-4 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.2em] text-muted"><span className="h-1.5 w-1.5 rounded-full bg-[#8e9a73]" />A shared point of view</p><h1 className="text-[38px] font-medium leading-[1.14] tracking-[-1.6px] sm:text-[48px] sm:tracking-[-2px] lg:text-[53px]">The everyday.<br />Seen <span className="font-serif italic font-normal text-accent">differently.</span></h1></div>
          <div className="max-w-[330px] pb-1 md:pb-0"><p className="text-[13px] leading-[1.8] text-muted">A collection of moments, places, and perspectives.<br className="hidden lg:block" /> Discover something beautiful. Share something you.</p><button onClick={openUpload} disabled={checkingSession} className="button-primary mt-5"><ImagePlus size={17} strokeWidth={1.7} />Upload an image<ArrowUpRight size={16} className="ml-4" /></button></div>
        </section>

        <section className="relative mb-12 grid min-h-[280px] overflow-hidden rounded-xl border border-[#dce0d3] bg-[#eaece1] md:grid-cols-[.95fr_1.7fr]" aria-label="Welcome to Folio">
          <div className="absolute bottom-0 right-0 top-0 w-full opacity-60 md:w-[74%] md:opacity-100"><Landscape /></div>
          <div className="relative z-1 flex flex-col items-start px-7 py-8 sm:px-9 sm:py-9"><span className="mb-4 flex items-center gap-1.5 rounded-full border border-[#939d7c]/35 bg-[#eaece1]/70 px-2.5 py-1 text-[9px] font-medium uppercase tracking-[.13em] text-[#62714f]"><Leaf size={11} />Made for your moments</span><h2 className="font-serif text-[32px] leading-[1.15] tracking-[-.7px] sm:text-[36px]">Big adventures.<br />Small observations.<br /><span className="italic">All welcome here.</span></h2><button onClick={scrollToGallery} className="mt-6 flex items-center gap-3 text-xs font-medium"><span className="flex h-7 w-7 items-center justify-center rounded-full border border-ink/25 transition hover:bg-white/60"><ArrowDown size={13} /></span>Take a look around</button></div>
          <div className="absolute bottom-5 right-6 hidden items-center gap-2 rounded-full border border-white/25 bg-[#284d3d]/35 px-3 py-1.5 text-[9px] tracking-wide text-white/90 backdrop-blur-sm sm:flex"><Aperture size={12} />A little wonder goes a long way</div>
          <span className="absolute right-6 top-6 hidden text-[9px] uppercase tracking-[.2em] text-[#53684f] md:block">Less scrolling. More seeing.</span>
        </section>

        <section ref={gallery} className="scroll-mt-8" aria-label="Image gallery">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-3"><h2 className="text-[22px] font-semibold tracking-[-.7px]">The gallery</h2><span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-muted">{loading ? "…" : result.total}</span></div><span className="flex items-center gap-1.5 text-[11px] text-muted"><span className="h-1 w-1 rounded-full bg-accent/70" />Fresh perspectives, newest first</span></div>
          <div className="mb-6 flex flex-col justify-between gap-4 border-b border-line pb-5 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2"><button onClick={() => { setMine(false); setPage(1); }} className={`flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-xs font-medium transition ${!mine ? "bg-ink text-white" : "text-muted hover:bg-line/50"}`}><Globe2 size={14} />All images</button>{session && <button onClick={() => { setMine(true); setPage(1); }} className={`flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-xs font-medium transition ${mine ? "bg-ink text-white" : "text-muted hover:bg-line/50"}`}><UserRound size={14} />My uploads</button>}</div>
            <div className="flex items-center gap-3"><div className="relative min-w-0 flex-1 sm:w-56 sm:flex-none"><Search size={15} className="absolute left-3 top-3 text-muted" /><input aria-label="Search images" placeholder="Find a little inspiration…" value={query} onChange={(event) => setQuery(event.target.value)} className="w-full rounded-lg border border-line bg-transparent py-2.5 pl-9 pr-8 text-xs placeholder:text-muted/80 focus:border-accent" />{query && <button onClick={() => setQuery("")} aria-label="Clear search" className="absolute right-2.5 top-3 text-muted"><X size={13} /></button>}</div><div className="flex items-center rounded-lg border border-line p-1"><button aria-label="Comfortable grid" aria-pressed={!compact} onClick={() => setCompact(false)} className={`rounded p-1.5 ${!compact ? "bg-[#eaeae2] text-ink" : "text-muted hover:text-ink"}`}><LayoutGrid size={15} /></button><button aria-label="Compact grid" aria-pressed={compact} onClick={() => setCompact(true)} className={`rounded p-1.5 ${compact ? "bg-[#eaeae2] text-ink" : "text-muted hover:text-ink"}`}><Grid2X2 size={15} /></button></div></div>
          </div>

          {loading ? <div role="status" aria-label="Loading images" className={`grid gap-5 ${compact ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"}`}>{Array.from({ length: 3 }, (_, i) => <div key={i} className="animate-pulse overflow-hidden rounded-xl border border-line bg-white"><div className="aspect-[4/3] bg-line/70" /><div className="space-y-3 p-4"><div className="h-3 w-2/3 rounded bg-line" /><div className="h-2 w-1/3 rounded bg-line/70" /></div></div>)}</div> : error ? <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-line bg-white p-6 text-center"><Images size={30} className="mb-4 text-muted" /><h3 className="text-lg font-medium">A little trouble loading the gallery.</h3><p role="alert" className="mt-2 max-w-md text-sm text-muted">{error}</p><button onClick={() => setRefresh(refresh + 1)} className="button-secondary mt-5">Try again <ArrowRight size={14} /></button></div> : result.items.length === 0 ? (
            <div className="relative flex min-h-[270px] flex-col items-center justify-center overflow-hidden rounded-xl border border-line bg-white/65 px-5 py-9 text-center">
              <div className="relative mb-5"><span className="absolute -left-6 top-1 h-1.5 w-1.5 rounded-full bg-[#b6bd9b]" /><span className="absolute -right-5 bottom-1 h-1 w-1 rounded-full bg-accent/45" /><div className="flex h-14 w-14 -rotate-6 items-center justify-center rounded-xl border border-[#dce0d2] bg-[#f0f2e9]"><Images size={27} strokeWidth={1.2} className="text-[#7a8866]" /></div><Sparkles size={14} strokeWidth={1.4} className="absolute -right-3 -top-1 text-accent/65" /></div>
              <h3 className="font-serif text-[25px] tracking-[-.4px]">{search ? "A different view, perhaps?" : mine ? "Your story starts with one image." : "A blank canvas. Endless possibilities."}</h3>
              <p className="mt-2 max-w-sm text-xs leading-[1.8] text-muted">{search ? `No images found for “${search}”. Try a different word or explore the whole gallery.` : mine ? "You haven’t shared any images yet. Let us see the world through your lens." : "Every collection starts somewhere. Be the first to share a moment and make this space a little more you."}</p>
              {filtered ? <div className="mt-5 flex items-center gap-4">{mine && !search && <button onClick={openUpload} className="flex items-center gap-2 text-xs font-semibold text-accent hover:underline">Share your first image <ArrowUpRight size={14} /></button>}<button onClick={() => { setQuery(""); setSearch(""); setMine(false); setPage(1); }} className="text-xs font-medium text-muted hover:text-ink">Explore all images <ArrowRight size={13} className="ml-1 inline" /></button></div> : <button onClick={openUpload} disabled={checkingSession} className="mt-5 flex items-center gap-2 text-xs font-semibold text-accent hover:underline"><ImagePlus size={14} />Share the first image<ArrowUpRight size={14} /></button>}
              {!filtered && <span className="absolute bottom-5 right-5 hidden text-[9px] uppercase tracking-[.17em] text-muted/50 sm:block">Good things start small</span>}
            </div>
          ) : (
            <div className={`grid gap-x-5 gap-y-7 ${compact ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"}`}>
              {result.items.map((image) => <article key={image.id} className="group min-w-0"><button onClick={() => setSelected(image)} aria-label={`View ${image.title || image.filename}`} className="relative block aspect-[4/3] w-full overflow-hidden rounded-xl bg-[#e9e9e2]"><img src={image.url} alt={image.title || image.filename} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.035] motion-reduce:transition-none" /><span className="absolute inset-0 bg-black/0 transition group-hover:bg-black/10" /><span className="absolute bottom-3 right-3 flex h-8 w-8 translate-y-1 items-center justify-center rounded-full bg-white/95 text-ink opacity-0 transition group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:opacity-100"><ArrowUpRight size={16} /></span>{image.uploader === session?.username && <span className="absolute left-3 top-3 rounded-full bg-white/95 px-2 py-1 text-[9px] font-medium">Your perspective</span>}<span className="absolute right-3 top-3 rounded bg-black/20 px-1.5 py-0.5 text-[9px] font-medium tracking-wide text-white backdrop-blur-sm">{image.content_type === "image/png" ? "PNG" : "JPEG"}</span></button><div className="px-0.5 pt-3.5"><button onClick={() => setSelected(image)} className="block max-w-full truncate text-left text-[14px] font-medium tracking-[-.2px] transition hover:text-accent">{image.title || image.filename}</button><div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted"><span className="flex min-w-0 items-center gap-1.5"><span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-line/70"><UserRound size={9} /></span><span className="max-w-32 truncate">{image.uploader}</span></span><time dateTime={image.uploaded_at}>{formatDate(image.uploaded_at)}</time></div></div></article>)}
            </div>
          )}

          <div className="mt-6 flex items-center justify-between gap-3 text-[11px] text-muted"><p>{result.total ? `Showing ${(page - 1) * 12 + 1}–${Math.min(page * 12, result.total)} of ${result.total} images` : "A little space, waiting to be filled."}</p><nav aria-label="Gallery pagination" className="flex items-center gap-3"><button onClick={() => { setPage(page - 1); scrollToGallery(); }} disabled={loading || page <= 1} aria-label="Previous page" className="rounded-md border border-line p-1.5 hover:bg-white disabled:opacity-30"><ChevronLeft size={14} /></button><span>Page {page} of {totalPages}</span><button onClick={() => { setPage(page + 1); scrollToGallery(); }} disabled={loading || page >= totalPages} aria-label="Next page" className="rounded-md border border-line p-1.5 hover:bg-white disabled:opacity-30"><ChevronRight size={14} /></button></nav></div>
        </section>

        <div className="mt-12 grid grid-cols-1 gap-5 border-t border-line pt-7 sm:grid-cols-3 sm:gap-8"><div className="flex items-start gap-3"><Globe2 size={19} strokeWidth={1.4} className="mt-0.5 shrink-0 text-[#84916d]" /><div><h3 className="text-xs font-medium">Different eyes. One community.</h3><p className="mt-1.5 text-[11px] leading-relaxed text-muted">A gallery for everyone, from everywhere.</p></div></div><div className="flex items-start gap-3"><ImagePlus size={19} strokeWidth={1.4} className="mt-0.5 shrink-0 text-[#84916d]" /><div><h3 className="text-xs font-medium">Your images, just as they are.</h3><p className="mt-1.5 text-[11px] leading-relaxed text-muted">Original quality. No filters. All you.</p></div></div><div className="flex items-start gap-3"><Heart size={19} strokeWidth={1.4} className="mt-0.5 shrink-0 text-[#84916d]" /><div><h3 className="text-xs font-medium">Keep it thoughtful. Keep it yours.</h3><p className="mt-1.5 text-[11px] leading-relaxed text-muted">Share what you create. Inspire someone else.</p></div></div></div>
      </main>

      <footer className="border-t border-line"><div className="mx-auto flex max-w-[1320px] flex-col items-start justify-between gap-4 px-5 py-6 sm:flex-row sm:items-center sm:px-8 lg:px-14"><div className="flex items-center gap-3"><Aperture size={20} className="text-accent" strokeWidth={1.6} /><span className="text-sm font-semibold tracking-[-.5px]">folio.</span><span className="ml-2 border-l border-line pl-4 text-[10px] text-muted">A little space for the things you see.</span></div><button onClick={() => setDialog("about")} className="flex items-center gap-1.5 text-[10px] text-muted hover:text-accent">Made for a shared point of view <ArrowUpRight size={12} /></button></div></footer>

      {notice && <div role="status" className="fixed bottom-5 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-3 rounded-xl border border-line bg-ink px-4 py-3.5 text-xs leading-relaxed text-white shadow-xl"><Check size={17} className="shrink-0 text-[#b4c49a]" /><span className="flex-1">{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss message" className="p-1 text-white/70"><X size={14} /></button></div>}
      {(dialog === "login" || dialog === "register") && <Modal title={dialog === "login" ? "Sign in to Folio" : "Join Folio"} onClose={closeDialog}><AuthForm initialMode={dialog} onSuccess={signedIn} /></Modal>}
      {dialog === "upload" && session && <Modal title="Upload an image" onClose={closeDialog}><UploadForm token={session.token} onSuccess={() => { setDialog(null); setMine(false); setQuery(""); setSearch(""); setPage(1); setRefresh(refresh + 1); setNotice("Your perspective is now part of the gallery."); window.setTimeout(scrollToGallery, 100); }} /></Modal>}
      {dialog === "about" && <Modal title="About Folio" onClose={closeDialog}><div className="p-8 sm:p-10"><Aperture size={36} strokeWidth={1.5} className="mb-6 text-accent" /><p className="mb-3 text-[10px] uppercase tracking-[.18em] text-muted">Our little space</p><h2 className="font-serif text-3xl leading-tight">There’s wonder<br />in the everyday.</h2><div className="mt-5 space-y-4 text-sm leading-[1.8] text-muted"><p>Folio is a shared gallery for the way you see the world. Big adventures, quiet corners, fleeting light — every perspective belongs here.</p><p>Anyone can explore. Create an account to share your own PNG or JPEG images, in their original quality. Your uploads stay yours to delete, whenever you choose.</p><p>Share only images you own or have permission to use, and keep this a thoughtful space for everyone.</p></div><button onClick={() => { closeDialog(); scrollToGallery(); }} className="button-primary mt-6">Find a new perspective <ArrowRight size={16} /></button></div></Modal>}
      {selected && <Modal title={selected.title || selected.filename} onClose={() => setSelected(null)} wide><ImageViewer image={selected} session={session} onDeleted={() => { setSelected(null); setRefresh(refresh + 1); setNotice("Image deleted. A little room for something new."); }} /></Modal>}
    </div>
  );
}

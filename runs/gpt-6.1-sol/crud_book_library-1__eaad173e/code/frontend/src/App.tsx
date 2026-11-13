import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, BookOpen, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, Heart, Leaf, LoaderCircle, LogOut, MessageCircle, Pencil, Plus, Search, ShieldCheck, Sparkles, Star, Trash2, Users, X } from "lucide-react";
import { api, ApiError, errorMessage, navigate } from "./api";
import type { Book, BookList, FieldErrors, Review } from "./api";
import BookCover from "./BookCover";
import BookIllustration from "./BookIllustration";

type ModalState = { kind: "login" | "register" | "add" | "about" } | { kind: "edit" | "delete"; book: Book } | null;
type Notice = { message: string; error?: boolean };
const primary = "inline-flex items-center justify-center gap-2 rounded-lg bg-forest px-5 py-3 text-[13px] font-medium text-white transition hover:bg-[#254a39] disabled:opacity-50";
const secondary = "inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-white/60 px-4 py-2.5 text-[13px] font-medium transition hover:bg-white disabled:opacity-40";
const inputStyle = "w-full rounded-lg border border-[#dddfd4] bg-white px-3.5 py-3 text-sm text-ink placeholder:text-[#a1a397] focus:border-forest focus:ring-2 focus:ring-forest/10 focus:ring-offset-0";

function Logo({ small = false }: { small?: boolean }) {
  return <span className="inline-flex items-center gap-2.5"><BookOpen strokeWidth={1.8} className={small ? "h-5 w-5 text-forest" : "h-7 w-7 text-forest"} /><span className={`font-serif font-semibold tracking-[-1.5px] ${small ? "text-[27px]" : "text-[34px]"}`}>folio<span className="text-[#8a9b78]">.</span></span></span>;
}

function Rating({ value, count, compact = false }: { value: number | null; count?: number; compact?: boolean }) {
  if (value === null) return <span className="text-xs text-[#999c90]">Not yet rated</span>;
  return <div className="flex items-center gap-2"><Star className={`${compact ? "h-3.5 w-3.5" : "h-4 w-4"} fill-[#b58b43] text-[#b58b43]`} strokeWidth={1.5} /><span className="text-[13px] font-semibold text-ink">{value.toFixed(1)}</span>{count !== undefined && <span className="ml-1 hidden text-[11px] text-muted sm:inline">({count} {count === 1 ? "review" : "reviews"})</span>}</div>;
}

function Stars({ rating, size = 14 }: { rating: number; size?: number }) {
  return <span className="inline-flex gap-0.5" aria-label={`${rating} out of 5 stars`}>{Array.from({ length: 5 }, (_, i) => <Star key={i} size={size} strokeWidth={1.5} className={i < rating ? "fill-[#b58b43] text-[#b58b43]" : "text-[#d4d6c9]"} />)}</span>;
}

function ErrorBox({ message }: { message: string }) {
  return <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-800"><CircleAlert size={17} className="mt-0.5 shrink-0" />{message}</div>;
}

function Field({ label, name, error, optional = false, children }: { label: string; name: string; error?: string; optional?: boolean; children: ReactNode }) {
  return <div><label htmlFor={name} className="mb-2 flex items-center gap-2 text-[13px] font-medium">{label}{optional && <span className="text-[11px] font-normal text-muted">optional</span>}</label>{children}{error && <p id={`${name}-error`} className="mt-1.5 text-xs text-red-700">{error}</p>}</div>;
}

function Modal({ children, title, onClose }: { children: ReactNode; title: string; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const getFocusable = () => Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, textarea, a[href], [tabindex="0"]') || []);
    const firstInput = panel.current?.querySelector<HTMLElement>("input, select, textarea");
    (firstInput || getFocusable()[0])?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
      if (event.key === "Tab") {
        const items = getFocusable();
        const first = items[0];
        const last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => { document.body.style.overflow = originalOverflow; document.removeEventListener("keydown", handleKey); previous?.focus(); };
  }, []);
  return <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#1e3027]/40 p-4 backdrop-blur-[3px]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div ref={panel} role="dialog" aria-modal="true" aria-label={title} className="relative my-auto w-full max-w-[460px] rounded-2xl border border-white/70 bg-paper p-7 shadow-2xl sm:p-9"><button type="button" onClick={onClose} aria-label="Close dialog" className="absolute right-4 top-4 rounded-full p-2 text-muted transition hover:bg-forest/5 hover:text-ink"><X size={19} /></button>{children}</div></div>;
}

function AuthForm({ mode, changeMode, onComplete }: { mode: "login" | "register"; changeMode: (mode: "login" | "register") => void; onComplete: (username: string) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fields, setFields] = useState<FieldErrors>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const register = mode === "register";
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setFields({});
    try {
      const body = JSON.stringify({ username, password });
      if (register) await api("/auth/register", { method: "POST", body });
      const result = await api<{ token: string }>("/auth/login", { method: "POST", body });
      localStorage.setItem("folio-token", result.token);
      const user = await api<{ username: string }>("/auth/me");
      onComplete(user.username);
    } catch (error) { setError(errorMessage(error)); if (error instanceof ApiError) setFields(error.fields); }
    finally { setBusy(false); }
  }
  return <><div className="mb-6"><Logo small /></div><h2 className="font-serif text-[33px] tracking-tight">{register ? "Your next chapter starts here." : "Welcome back, reader."}</h2><p className="mb-7 mt-2 text-[13px] leading-relaxed text-muted">{register ? "Join our community. Add good books and share your perspective." : "Sign in to add to the bookshelf and join the conversation."}</p><form onSubmit={submit} noValidate className="space-y-5">{error && <ErrorBox message={error} />}<Field name="username" label="Username" error={fields.username}><input id="username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} className={inputStyle} placeholder="Your reader name" aria-invalid={!!fields.username} aria-describedby={fields.username ? "username-error" : undefined} /></Field><Field name="password" label="Password" error={fields.password}><input id="password" type="password" autoComplete={register ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} className={inputStyle} placeholder={register ? "Choose a password" : "Enter your password"} aria-invalid={!!fields.password} aria-describedby={fields.password ? "password-error" : undefined} /></Field><button type="submit" disabled={busy} className={`${primary} mt-1 w-full`}>{busy ? <LoaderCircle size={16} className="animate-spin" /> : null}{register ? "Create your account" : "Sign in"}<ArrowRight size={16} /></button></form><div className="mt-6 text-center text-[12px] text-muted">{register ? "Already part of the community?" : "New to the bookshelf?"} <button onClick={() => changeMode(register ? "login" : "register")} className="ml-1 font-medium text-forest underline decoration-forest/30 underline-offset-4">{register ? "Sign in" : "Create an account"}</button></div><div className="mt-7 flex items-center justify-center gap-1.5 border-t border-line pt-5 text-[11px] text-muted"><ShieldCheck size={14} />A little community. A lot of good books.</div></>;
}

function BookForm({ book, onSaved, onCancel }: { book?: Book; onSaved: (book: Book) => void; onCancel: () => void }) {
  const [title, setTitle] = useState(book?.title || "");
  const [author, setAuthor] = useState(book?.author || "");
  const [year, setYear] = useState(book?.year?.toString() || "");
  const [isbn, setIsbn] = useState(book?.isbn || "");
  const [fields, setFields] = useState<FieldErrors>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setFields({}); setError("");
    try {
      const parsedYear = Number(year);
      const result = await api<Book>(book ? `/books/${book.id}` : "/books", { method: book ? "PUT" : "POST", body: JSON.stringify({ title, author, year: year.trim() ? (Number.isFinite(parsedYear) ? parsedYear : year) : null, isbn: isbn.trim() || null }) });
      onSaved(result);
    } catch (error) { setError(errorMessage(error)); if (error instanceof ApiError) setFields(error.fields); }
    finally { setBusy(false); }
  }
  return <><div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-forest/8 text-forest"><BookOpen size={22} strokeWidth={1.5} /></div><h2 className="font-serif text-[33px] tracking-tight">{book ? "A little fine-tuning." : "Make room on the shelf."}</h2><p className="mb-7 mt-2 text-[13px] leading-relaxed text-muted">{book ? "Keep the shared catalogue accurate for every reader." : "Share a book with the community. Someone's next favorite could be yours."}</p><form onSubmit={submit} noValidate className="space-y-4">{error && <ErrorBox message={error} />}<Field name="title" label="Book title" error={fields.title}><input id="title" className={inputStyle} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. The Midnight Library" aria-invalid={!!fields.title} aria-describedby={fields.title ? "title-error" : undefined} /></Field><Field name="author" label="Author" error={fields.author}><input id="author" className={inputStyle} value={author} onChange={(event) => setAuthor(event.target.value)} placeholder="Who wrote it?" aria-invalid={!!fields.author} aria-describedby={fields.author ? "author-error" : undefined} /></Field><div className="grid grid-cols-[1fr_1.5fr] gap-4"><Field name="year" label="Publication year" optional error={fields.year}><input id="year" type="number" className={inputStyle} value={year} onChange={(event) => setYear(event.target.value)} placeholder="2024" aria-invalid={!!fields.year} aria-describedby={fields.year ? "year-error" : undefined} /></Field><Field name="isbn" label="ISBN" optional error={fields.isbn}><input id="isbn" className={inputStyle} value={isbn} onChange={(event) => setIsbn(event.target.value)} placeholder="978…" aria-invalid={!!fields.isbn} aria-describedby={fields.isbn ? "isbn-error" : undefined} /></Field></div><div className="flex items-center justify-end gap-3 border-t border-line pt-5"><button type="button" onClick={onCancel} className={secondary}>Cancel</button><button disabled={busy} className={primary}>{busy ? <LoaderCircle size={16} className="animate-spin" /> : <Check size={16} />}{book ? "Save changes" : "Add to bookshelf"}</button></div></form></>;
}

function DeleteForm({ book, onDeleted, onCancel }: { book: Book; onDeleted: () => void; onCancel: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function remove() {
    setBusy(true); setError("");
    try { await api(`/books/${book.id}`, { method: "DELETE" }); onDeleted(); }
    catch (error) { setError(errorMessage(error)); setBusy(false); }
  }
  return <><div className="mb-5 inline-flex rounded-xl bg-red-50 p-3 text-red-700"><Trash2 size={22} /></div><h2 className="font-serif text-[31px]">Remove this book?</h2><p className="mb-5 mt-3 text-sm leading-relaxed text-muted"><strong className="font-medium text-ink">{book.title}</strong> and all {book.review_count || "its"} reviews will be permanently removed from the shared bookshelf. This can't be undone.</p>{error && <ErrorBox message={error} />}<div className="mt-7 flex justify-end gap-3"><button onClick={onCancel} className={secondary}>Keep the book</button><button onClick={remove} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-red-700 px-4 py-2.5 text-[13px] font-medium text-white hover:bg-red-800 disabled:opacity-50">{busy && <LoaderCircle size={15} className="animate-spin" />}Delete book</button></div></>;
}

function About() {
  return <><div className="mb-5 inline-flex rounded-xl bg-forest/8 p-3 text-forest"><Heart size={23} strokeWidth={1.5} /></div><h2 className="font-serif text-[34px]">Every reader has a story.</h2><p className="mt-4 text-sm leading-7 text-muted">Folio is a little corner of the internet for people who love books. A shared catalogue, honest reviews, and the joy of finding your next great read.</p><div className="mt-7 space-y-5">{[{ Icon: BookOpen, title: "A bookshelf we build together", text: "Anyone can browse. Sign in to add, edit, or remove books from our shared collection." }, { Icon: MessageCircle, title: "Your perspective matters", text: "Rate each book once, from one to five stars, and tell other readers what you thought." }, { Icon: Leaf, title: "Simple, thoughtful, open", text: "No algorithms or endless feeds. Just good books and the people who read them." }].map(({ Icon, title, text }) => <div key={title} className="flex gap-3"><Icon size={20} className="mt-0.5 shrink-0 text-forest" strokeWidth={1.5} /><div><h3 className="text-sm font-medium">{title}</h3><p className="mt-1 text-[12px] leading-relaxed text-muted">{text}</p></div></div>)}</div><p className="mt-7 border-t border-line pt-5 font-serif text-lg italic text-forest">Good books. Better together.</p></>;
}

function Library({ username, onAction, refresh, onAbout }: { username: string | null; onAction: (state: ModalState) => void; refresh: number; onAbout: () => void }) {
  const params = new URLSearchParams(window.location.search);
  const [query, setQuery] = useState(params.get("q") || "");
  const [search, setSearch] = useState(params.get("q") || "");
  const [page, setPage] = useState(Math.max(1, Number(params.get("page")) || 1));
  const [pageSize, setPageSize] = useState(8);
  const [books, setBooks] = useState<BookList | null>(null);
  const [stats, setStats] = useState({ books: 0, reviews: 0 });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (query === search) return;
    const timer = window.setTimeout(() => { setSearch(query); setPage(1); }, 300);
    return () => window.clearTimeout(timer);
  }, [query, search]);
  useEffect(() => {
    const controller = new AbortController();
    const parameters = new URLSearchParams({ q: search, page: String(page), page_size: String(pageSize) });
    const urlParameters = new URLSearchParams();
    if (search) urlParameters.set("q", search);
    if (page > 1) urlParameters.set("page", String(page));
    window.history.replaceState({}, "", `/${urlParameters.size ? `?${urlParameters}` : ""}`);
    const load = async () => {
      setLoading(true); setError("");
      try {
        const result = await api<BookList>(`/books?${parameters}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        if (result.total > 0 && page > Math.ceil(result.total / pageSize)) { setPage(Math.ceil(result.total / pageSize)); return; }
        setBooks(result);
      } catch (error) { if (!controller.signal.aborted) setError(errorMessage(error)); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    };
    void load();
    return () => controller.abort();
  }, [search, page, pageSize, refresh, retry]);
  useEffect(() => {
    const controller = new AbortController();
    api<{ books: number; reviews: number }>("/stats", { signal: controller.signal }).then(setStats).catch(() => {});
    return () => controller.abort();
  }, [refresh]);
  const pages = Math.max(1, Math.ceil((books?.total || 0) / pageSize));
  return <>
    <section className="relative grid items-center gap-6 border-b border-line pb-11 pt-12 md:grid-cols-[1.2fr_1fr] md:gap-10 md:pb-10 md:pt-12">
      <div><div className="mb-5 flex items-center gap-2.5 text-[10px] font-semibold tracking-[.17em] text-forest"><span className="h-px w-6 bg-[#789075]" />FOR THE LOVE OF READING</div><h1 className="font-serif text-[51px] font-medium leading-[1.04] tracking-[-1.7px] sm:text-[64px]">Good books.<br /><span className="text-forest">Better together.</span></h1><p className="mt-5 max-w-[420px] text-[14px] leading-[1.8] text-muted">A shared bookshelf for curious minds. Discover your next<br className="hidden lg:block" /> great read, leave a review, and pass the good ones on.</p><div className="mt-7 flex flex-wrap items-center gap-6 text-[11px] text-muted sm:gap-7"><span className="flex items-center gap-2"><BookOpen size={15} strokeWidth={1.6} className="text-[#7b8e72]" /><strong className="font-semibold text-ink">{stats.books}</strong> books & counting</span><span className="flex items-center gap-2"><MessageCircle size={15} strokeWidth={1.6} className="text-[#7b8e72]" /><strong className="font-semibold text-ink">{stats.reviews}</strong> reader reviews</span><span className="hidden items-center gap-2 xl:flex"><Heart size={14} strokeWidth={1.6} className="text-[#7b8e72]" />One reading community</span></div></div>
      <div className="hidden pl-3 pr-4 md:block"><BookIllustration /></div>
    </section>
    <section className="pb-8 pt-9" aria-label="Book catalogue">
      <div className="flex items-center justify-between gap-4"><div className="flex items-center gap-3"><h2 className="font-serif text-[29px] font-medium tracking-[-.5px]">The community bookshelf</h2><span className="hidden rounded-full border border-[#dde3d3] bg-[#edf0e6] px-2.5 py-1 text-[10px] font-medium text-[#687b5a] sm:inline-block">A little discovery awaits</span></div><button onClick={() => onAction(username ? { kind: "add" } : { kind: "login" })} className={`${primary} shrink-0 px-4 py-2.5`}><Plus size={16} strokeWidth={1.8} /><span className="hidden sm:inline">Add a book</span><span className="sm:hidden">Add</span></button></div>
      <div className="mb-5 mt-6 flex flex-wrap items-center justify-between gap-4"><div className="relative w-full sm:max-w-[385px]"><Search size={17} strokeWidth={1.6} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#93998a]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by title, author, or ISBN…" aria-label="Search books" className="h-10 w-full rounded-lg border border-[#e0e3d8] bg-white/70 pl-10 pr-10 text-[12px] placeholder:text-[#95998e] focus:border-forest focus:ring-2 focus:ring-forest/10 focus:ring-offset-0" />{query && <button onClick={() => setQuery("")} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted"><X size={14} /></button>}</div><div className="flex items-center gap-2 text-[11px] text-muted"><ArrowDown size={13} />Newest additions first</div></div>
      <div className="overflow-hidden rounded-xl border border-[#e1e4d9] bg-[#fdfdf9] shadow-[0_2px_5px_#283e3203]">
        <div className="overflow-x-auto"><table className="w-full min-w-[590px] table-fixed text-left"><colgroup><col className="w-[43%]" /><col className="w-[23%]" /><col className="w-[10%]" /><col className="w-[20%]" /><col className="w-[4%]" /></colgroup><thead className="border-b border-line bg-[#f0f2e9]/75"><tr className="h-10 text-[10px] font-medium tracking-[.085em] text-[#7c8372]"><th className="pl-6 font-medium">BOOK TITLE</th><th className="font-medium">AUTHOR</th><th className="font-medium">YEAR</th><th className="font-medium">READER RATING</th><th aria-label="View book" /></tr></thead><tbody className="divide-y divide-[#eceee4]">{!error && books?.items.map((book) => <tr key={book.id} className="group h-[76px] transition-colors hover:bg-[#f3f5ec]"><td className="py-3 pl-6 pr-4"><a href={`/books/${book.id}`} onClick={(event) => { event.preventDefault(); navigate(`/books/${book.id}`); }} className="flex items-center gap-4 rounded-sm"><BookCover book={book} /><span className="text-[13px] font-medium leading-relaxed text-[#354735] group-hover:text-forest">{book.title}</span></a></td><td className="pr-3 text-[12px] text-[#797e72]">{book.author}</td><td className="text-[12px] tabular-nums text-[#838778]">{book.year || "—"}</td><td><Rating value={book.average_rating} count={book.review_count} compact /></td><td><a aria-label={`View ${book.title}`} href={`/books/${book.id}`} onClick={(event) => { event.preventDefault(); navigate(`/books/${book.id}`); }} className="inline-flex rounded p-1 text-[#a3ab97] transition group-hover:translate-x-0.5 group-hover:text-forest"><ChevronRight size={17} strokeWidth={1.6} /></a></td></tr>)}</tbody></table></div>
        {error ? <div className="flex flex-col items-center gap-4 p-12"><ErrorBox message={error} /><button className={secondary} onClick={() => setRetry((value) => value + 1)}>Try again</button></div> : !books || (loading && !books.items.length) ? <div className="flex min-h-52 items-center justify-center gap-3 text-sm text-muted"><LoaderCircle size={19} className="animate-spin text-forest" />Opening the bookshelf…</div> : !books.items.length ? <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center"><BookOpen size={32} strokeWidth={1.2} className="mb-4 text-[#9aa78a]" /><h3 className="font-serif text-2xl">{search ? "No books on this shelf just yet." : "A new shelf, a new beginning."}</h3><p className="mb-4 mt-2 text-[13px] text-muted">{search ? `We couldn't find anything for “${search}”. Try a different title or author.` : "Be the first to share a book with the community."}</p><button onClick={() => search ? setQuery("") : onAction(username ? { kind: "add" } : { kind: "login" })} className={secondary}>{search ? "Clear search" : "Add the first book"}</button></div> : null}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-[#fcfcf7] px-6 py-4"><div className="flex items-center gap-3 text-[11px] text-[#8c9182]" aria-live="polite">{loading ? <LoaderCircle size={13} className="animate-spin" /> : null}<span>Showing <span className="font-medium text-[#656e5b]">{books?.total ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, books?.total || 0)}</span> of <span className="font-medium text-[#656e5b]">{books?.total || 0}</span> books</span><span className="hidden h-3 w-px bg-line sm:block" /><label className="hidden items-center gap-1.5 sm:flex"><select aria-label="Books per page" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} className="appearance-none bg-transparent pr-1 text-[11px]"><option value={8}>8 per page</option><option value={16}>16 per page</option><option value={24}>24 per page</option></select><ChevronDown size={11} /></label></div><nav aria-label="Catalogue pagination" className="flex items-center gap-1.5"><button disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)} aria-label="Previous page" className="flex h-7 w-7 items-center justify-center rounded-md border border-line text-muted hover:bg-[#edf0e5] disabled:opacity-35"><ChevronLeft size={14} /></button>{Array.from({ length: Math.min(pages, 5) }, (_, i) => Math.max(1, Math.min(page - 2, pages - 4)) + i).map((number) => <button key={number} onClick={() => setPage(number)} aria-label={`Page ${number}`} aria-current={page === number ? "page" : undefined} disabled={loading} className={`h-7 w-7 rounded-md text-[11px] transition ${page === number ? "bg-forest text-white" : "text-muted hover:bg-[#edf0e5]"}`}>{number}</button>)}<button disabled={page >= pages || loading} onClick={() => setPage((value) => value + 1)} aria-label="Next page" className="flex h-7 w-7 items-center justify-center rounded-md border border-line text-muted hover:bg-[#edf0e5] disabled:opacity-35"><ChevronRight size={14} /></button></nav></div>
      </div>
      <div className="mt-6 flex items-center justify-center gap-2 text-center text-[11px] text-[#939887]"><Users size={14} strokeWidth={1.5} /><p>Built by readers, for readers. <button onClick={() => onAction(username ? { kind: "add" } : { kind: "register" })} className="font-medium text-[#6c7e5f] underline decoration-[#b7c1a7] underline-offset-3">{username ? "Share a good book." : "Make yourself at home."}</button></p></div>
    </section>
    <section className="mb-12 mt-2 flex flex-col items-start justify-between gap-4 rounded-xl border border-[#e0e5d5] bg-[#edf1e5] px-7 py-6 sm:flex-row sm:items-center"><div className="flex items-center gap-4"><div className="hidden h-10 w-10 items-center justify-center rounded-full border border-[#cdd8be] text-[#82956c] sm:flex"><Sparkles size={21} strokeWidth={1.4} /></div><div><h3 className="font-serif text-[22px] font-medium">Stories are better when they're shared.</h3><p className="mt-1 text-[12px] text-[#858d78]">A favorite book. An honest review. A new perspective. It all belongs here.</p></div></div><button onClick={onAbout} className="flex shrink-0 items-center gap-2 text-[12px] font-medium text-[#5b7050]">A little about Folio<ArrowRight size={16} strokeWidth={1.5} /></button></section>
  </>;
}

function ReviewForm({ bookId, onPosted }: { bookId: number; onPosted: () => void }) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<FieldErrors>({});
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setFields({});
    try { await api(`/books/${bookId}/reviews`, { method: "POST", body: JSON.stringify({ rating, comment }) }); onPosted(); }
    catch (error) { setError(errorMessage(error)); if (error instanceof ApiError) setFields(error.fields); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} noValidate className="rounded-xl border border-line bg-white/50 p-6"><h3 className="font-serif text-[25px]">What's your take?</h3><p className="mb-5 mt-1 text-xs leading-relaxed text-muted">Your next recommendation could start right here.</p>{error && <div className="mb-4"><ErrorBox message={error} /></div>}<fieldset><legend className="mb-2 text-[12px] font-medium">Your rating</legend><div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>{Array.from({ length: 5 }, (_, i) => <button key={i} type="button" onMouseEnter={() => setHover(i + 1)} onFocus={() => setHover(i + 1)} onBlur={() => setHover(0)} onClick={() => setRating(i + 1)} aria-label={`Rate ${i + 1} ${i === 0 ? "star" : "stars"}`} aria-pressed={rating === i + 1} className="rounded p-1"><Star size={27} strokeWidth={1.4} className={`transition ${(hover || rating) > i ? "fill-[#b58b43] text-[#b58b43]" : "text-[#c9cebe]"}`} /></button>)}<span className="ml-2 text-xs text-muted">{rating ? ["", "Not for me", "It was okay", "A good read", "Really enjoyed it", "A new favorite"][hover || rating] : "Choose a rating"}</span></div>{fields.rating && <p className="mt-2 text-xs text-red-700">{fields.rating}</p>}</fieldset><div className="mt-5"><Field name="comment" label="Your review" optional error={fields.comment}><textarea id="comment" rows={4} value={comment} onChange={(event) => setComment(event.target.value)} className={`${inputStyle} resize-y text-[13px] leading-relaxed`} placeholder="What stayed with you? Share your thoughts with other readers…" aria-invalid={!!fields.comment} aria-describedby={fields.comment ? "comment-error" : undefined} /></Field></div><div className="mt-4 flex items-center justify-between gap-3"><span className="text-[10px] text-muted">One book, one review per reader.</span><button disabled={busy} className={`${primary} px-4 py-2.5`}>{busy ? <LoaderCircle size={15} className="animate-spin" /> : <MessageCircle size={15} />}Post review</button></div></form>;
}

function BookPage({ id, username, onAction, refresh, onNotice }: { id: number; username: string | null; onAction: (state: ModalState) => void; refresh: number; onNotice: (notice: Notice) => void }) {
  const [book, setBook] = useState<Book | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setError(""); setLoading(true);
      try {
        const [book, result] = await Promise.all([api<Book>(`/books/${id}`, { signal: controller.signal }), api<{ items: Review[] }>(`/books/${id}/reviews`, { signal: controller.signal })]);
        if (!controller.signal.aborted) { setBook(book); setReviews(result.items); }
      } catch (error) { if (!controller.signal.aborted) setError(errorMessage(error)); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    };
    void load();
    return () => controller.abort();
  }, [id, refresh, revision]);
  const reviewed = reviews.some((review) => review.username === username);
  return <section className="pb-16 pt-9"><a href="/" onClick={(event) => { event.preventDefault(); navigate("/"); }} className="mb-8 inline-flex items-center gap-2 rounded text-xs text-muted hover:text-forest"><ArrowLeft size={15} />Back to the bookshelf</a>{error ? <div className="mx-auto max-w-lg py-10"><ErrorBox message={error} /><button onClick={() => setRevision((value) => value + 1)} className={`${secondary} mt-4`}>Try again</button></div> : !book ? <div className="flex items-center justify-center gap-3 py-24 text-muted"><LoaderCircle size={20} className="animate-spin" />Opening this book…</div> : <>
    <div className="flex flex-col gap-8 rounded-2xl border border-line bg-[#eff2e7] px-7 py-9 sm:flex-row sm:gap-10 sm:px-10"><div className="flex justify-center"><BookCover book={book} large /></div><div className="flex flex-1 flex-col justify-center"><p className="mb-4 text-[10px] font-semibold tracking-[.16em] text-[#7a8d6d]">ON THE COMMUNITY BOOKSHELF</p><h1 className="max-w-2xl font-serif text-[40px] font-medium leading-[1.1] tracking-[-.7px] sm:text-[47px]">{book.title}</h1><p className="mt-3 text-[15px] text-[#7d8571]">by <span className="text-[#5c6a50]">{book.author}</span></p><div className="mt-5"><Rating value={book.average_rating} count={book.review_count} /></div><div className="mt-6 flex flex-wrap gap-x-6 gap-y-3 text-[11px] text-muted"><span>Published <strong className="ml-1 font-medium text-[#627055]">{book.year || "Unknown"}</strong></span><span>ISBN <strong className="ml-1 font-medium text-[#627055]">{book.isbn || "Not provided"}</strong></span></div>{username && <div className="mt-7 flex gap-3"><button onClick={() => onAction({ kind: "edit", book })} className={`${secondary} border-[#d5dccb] bg-white/40`}><Pencil size={14} />Edit book</button><button onClick={() => onAction({ kind: "delete", book })} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-[12px] text-[#8b796c] hover:bg-red-50 hover:text-red-700"><Trash2 size={14} />Delete</button></div>}</div></div>
    <div className="mt-10 grid items-start gap-8 lg:grid-cols-[1.2fr_1fr]"><div><div className="mb-6 flex items-center gap-3"><h2 className="font-serif text-[29px]">Between the pages</h2><span className="rounded-full bg-[#eaf0e1] px-2.5 py-1 text-[10px] text-[#6b7e5e]">{book.review_count} {book.review_count === 1 ? "review" : "reviews"}</span>{loading && <LoaderCircle size={15} className="animate-spin text-muted" />}</div>{reviews.length ? <div className="divide-y divide-line">{reviews.map((review) => <article key={review.id} className="pb-6 pt-6 first:pt-0"><div className="flex items-center gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#dce3d2] bg-[#e9eedf] font-serif text-lg uppercase text-[#6c8058]">{review.username[0]}</div><div className="flex flex-1 items-center justify-between gap-3"><div><h3 className="text-[12px] font-medium">{review.username}{review.username === username && <span className="ml-2 text-[10px] text-muted">you</span>}</h3><div className="mt-1"><Stars rating={review.rating} size={12} /></div></div><time dateTime={review.created_at} className="shrink-0 text-[10px] text-[#959b8c]">{new Date(review.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</time></div></div><p className="mt-3 whitespace-pre-wrap pl-12 text-[13px] leading-[1.85] text-[#777f6d]">{review.comment || "This reader left a rating without a written review."}</p></article>)}</div> : <div className="rounded-xl border border-dashed border-[#dce1d2] px-6 py-10 text-center"><MessageCircle size={25} className="mx-auto mb-3 text-[#9aa68d]" strokeWidth={1.3} /><h3 className="font-serif text-xl">The conversation starts with you.</h3><p className="mt-2 text-xs text-muted">No reviews yet. Be the first to share your thoughts.</p></div>}</div><div className="lg:sticky lg:top-6">{username ? reviewed ? <div className="rounded-xl border border-[#dce3d0] bg-[#edf2e6] p-7"><CheckCircle2 size={26} className="mb-4 text-[#769563]" strokeWidth={1.5} /><h3 className="font-serif text-[25px]">Your perspective is on the shelf.</h3><p className="mt-2 text-[13px] leading-relaxed text-muted">Thanks for sharing your thoughts. You've already reviewed this book — now let's find your next read.</p><a href="/" onClick={(event) => { event.preventDefault(); navigate("/"); }} className="mt-5 inline-flex items-center gap-2 text-[12px] font-medium text-forest">Explore the bookshelf<ArrowRight size={15} /></a></div> : <ReviewForm bookId={id} onPosted={() => { setRevision((value) => value + 1); onNotice({ message: "Your review is on the shelf. Thanks for sharing!" }); }} /> : <div className="rounded-xl border border-line bg-white/50 p-7"><MessageCircle size={26} strokeWidth={1.4} className="mb-4 text-[#82956e]" /><h3 className="font-serif text-[26px]">Read it? We'd love your take.</h3><p className="mb-5 mt-2 text-[13px] leading-relaxed text-muted">Join the community to leave a rating and share your thoughts with fellow readers.</p><button onClick={() => onAction({ kind: "login" })} className={primary}>Sign in to review<ArrowRight size={15} /></button><p className="mt-4 text-[11px] text-muted">New here? <button onClick={() => onAction({ kind: "register" })} className="font-medium text-forest underline decoration-forest/30 underline-offset-3">Create an account</button></p></div>}</div></div>
    </>}</section>;
}

export default function App() {
  const [path, setPath] = useState(window.location.pathname);
  const [username, setUsername] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [signingOut, setSigningOut] = useState(false);
  const showNotice = useCallback((notice: Notice) => setNotice(notice), []);
  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname);
    const onExpired = () => { setUsername(null); setNotice({ message: "Your session has expired. Please sign in again.", error: true }); };
    window.addEventListener("popstate", onPopState);
    window.addEventListener("folio-session-expired", onExpired);
    const controller = new AbortController();
    if (localStorage.getItem("folio-token")) api<{ username: string }>("/auth/me", { signal: controller.signal }).then((user) => setUsername(user.username)).catch((error) => { if (!controller.signal.aborted && !(error instanceof ApiError && error.status === 401)) setNotice({ message: "Unable to restore your session. Please try again.", error: true }); });
    return () => { controller.abort(); window.removeEventListener("popstate", onPopState); window.removeEventListener("folio-session-expired", onExpired); };
  }, []);
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(null), 5000); return () => window.clearTimeout(timer); }, [notice]);
  const bookMatch = path.match(/^\/books\/(\d+)\/?$/);
  async function signOut() {
    setSigningOut(true);
    try { await api("/auth/logout", { method: "POST" }); }
    catch (error) { if (!(error instanceof ApiError && error.status === 401)) { showNotice({ message: errorMessage(error), error: true }); setSigningOut(false); return; } }
    localStorage.removeItem("folio-token"); setUsername(null); setSigningOut(false); showNotice({ message: "Signed out. The bookshelf is always here for you." });
  }
  function saved(book: Book) {
    const editing = modal?.kind === "edit";
    setModal(null); setRefresh((value) => value + 1); showNotice({ message: editing ? "Book updated. Looking good!" : "A new story on the shelf. Book added!" });
    if (!editing) navigate(`/books/${book.id}`);
  }
  return <div className="flex min-h-screen flex-col">
    <header className="border-b border-line bg-[#fcfcf7]/80">
      <div className="mx-auto flex h-[83px] max-w-[1280px] items-center justify-between px-5 sm:px-8">
        <div className="flex items-center gap-8 lg:gap-10">
          <a href="/" onClick={(event) => { event.preventDefault(); navigate("/"); }} className="rounded-sm" aria-label="Folio home"><Logo /></a>
          <span className="hidden h-5 w-px bg-line lg:block" />
          <span className="hidden text-[11px] text-[#929685] lg:inline">A shared bookshelf.</span>
          <nav className="hidden h-[83px] items-center gap-7 md:flex">
            <a href="/" onClick={(event) => { event.preventDefault(); navigate("/"); }} className="relative flex h-full items-center gap-1.5 text-[12px] font-medium text-forest">
              <span className="h-1 w-1 rounded-full bg-[#8d9c75]" />Library<span className="absolute inset-x-0 bottom-0 h-[2px] bg-[#597b51]" />
            </a>
            <button onClick={() => setModal({ kind: "about" })} className="text-[12px] text-muted transition hover:text-forest">Our story</button>
          </nav>
        </div>
        <div className="flex items-center gap-3 sm:gap-5">
          {username ? <>
            <span className="flex items-center gap-2 text-[12px] font-medium">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#e8edde] font-serif text-[15px] uppercase text-forest">{username[0]}</span>
              <span className="max-w-24 truncate sm:max-w-40">{username}</span>
            </span>
            <button onClick={signOut} disabled={signingOut} aria-label="Sign out" className="inline-flex items-center gap-1.5 rounded-lg p-2 text-[11px] text-muted hover:bg-forest/5 hover:text-forest">
              {signingOut ? <LoaderCircle size={14} className="animate-spin" /> : <LogOut size={14} />}<span className="hidden sm:inline">Sign out</span>
            </button>
          </> : <>
            <button onClick={() => setModal({ kind: "login" })} className="rounded px-1 py-2 text-[12px] font-medium text-[#6d7763] hover:text-forest">Sign in</button>
            <button onClick={() => setModal({ kind: "register" })} className={`${primary} gap-3 px-3.5 py-2.5 text-[11px] sm:px-4`}>Create account<ArrowRight size={14} className="hidden sm:block" /></button>
          </>}
        </div>
      </div>
    </header>
    <main className="mx-auto w-full max-w-[1280px] flex-1 px-5 sm:px-8">{bookMatch ? <BookPage key={bookMatch[1]} id={Number(bookMatch[1])} username={username} onAction={setModal} refresh={refresh} onNotice={showNotice} /> : path === "/" ? <Library username={username} onAction={setModal} refresh={refresh} onAbout={() => setModal({ kind: "about" })} /> : <div className="py-24 text-center"><BookOpen className="mx-auto mb-5 text-muted" size={36} strokeWidth={1.3} /><h1 className="font-serif text-4xl">This page turned a little too far.</h1><p className="mb-6 mt-3 text-sm text-muted">Let's get you back to the bookshelf.</p><button onClick={() => navigate("/")} className={primary}><ArrowLeft size={16} />Back to the library</button></div>}</main>
    <footer className="border-t border-line"><div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-4 px-5 py-6 sm:px-8"><div className="flex items-center gap-5"><a href="/" onClick={(event) => { event.preventDefault(); navigate("/"); }} aria-label="Folio home"><Logo small /></a><span className="text-[10px] text-[#989d8c]">A home for good books & curious minds.</span></div><div className="flex items-center gap-5 text-[10px] text-[#969c8a]"><button onClick={() => setModal({ kind: "about" })} className="hover:text-forest">About Folio</button><span className="flex items-center gap-1.5">Made with care<Heart size={11} strokeWidth={1.5} /></span></div></div></footer>
    {notice && <div role={notice.error ? "alert" : "status"} className={`fixed bottom-6 left-1/2 z-[60] flex w-max max-w-[calc(100%-32px)] -translate-x-1/2 items-center gap-3 rounded-xl border bg-[#fdfdf9] px-5 py-4 text-[13px] shadow-lg ${notice.error ? "border-red-200 text-red-800" : "border-[#dce4d0] text-forest"}`}>{notice.error ? <CircleAlert size={18} className="shrink-0" /> : <CheckCircle2 size={18} className="shrink-0" />}<span>{notice.message}</span><button onClick={() => setNotice(null)} aria-label="Dismiss notification" className="ml-2 rounded p-1"><X size={15} /></button></div>}
    {modal && <Modal title={{ login: "Sign in", register: "Create account", add: "Add a book", edit: "Edit book", delete: "Delete book", about: "About Folio" }[modal.kind]} onClose={() => setModal(null)}>{modal.kind === "login" || modal.kind === "register" ? <AuthForm key={modal.kind} mode={modal.kind} changeMode={(kind) => setModal({ kind })} onComplete={(username) => { setUsername(username); setModal(null); showNotice({ message: modal.kind === "register" ? `Welcome to the bookshelf, ${username}.` : `Good to see you again, ${username}.` }); }} /> : modal.kind === "add" || modal.kind === "edit" ? <BookForm book={modal.kind === "edit" ? modal.book : undefined} onSaved={saved} onCancel={() => setModal(null)} /> : modal.kind === "delete" ? <DeleteForm book={modal.book} onCancel={() => setModal(null)} onDeleted={() => { setModal(null); setRefresh((value) => value + 1); navigate("/"); showNotice({ message: "Book removed from the shared bookshelf." }); }} /> : <About />}</Modal>}
  </div>;
}

import { useEffect, useState } from "react";
import { api, relativeDate } from "./api";
import type { Note, NotePage, Session } from "./api";
import type { Navigate } from "./navigation";
import Icon from "./Icons";
import Link from "./Link";

const colors = ["bg-[#eef1e5]", "bg-[#f7ece4]", "bg-[#efedf5]", "bg-[#eaf1f2]", "bg-[#f5f1de]", "bg-[#edf1e9]"];

function NoteCard({ note, index, list, onTag }: { note: Note; index: number; list: boolean; onTag: (tag: string) => void }) {
  return (
    <article className={`group relative flex min-w-0 flex-col rounded-xl border border-line/70 p-6 transition duration-200 hover:-translate-y-0.5 hover:border-moss/25 hover:shadow-[0_8px_24px_-12px_#354b3e30] ${colors[index % colors.length]} ${list ? "sm:grid sm:grid-cols-[1fr_180px] sm:gap-x-8" : "min-h-72"}`}>
      <div className="mb-5 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.15em] text-moss/70">{note.pinned ? <><Icon name="pin" className="size-3" />Pinned note</> : <><Icon name="notes" className="size-3" />A little thought</>}</span>
        <span className="text-[10px] text-muted">{relativeDate(note.updated_at)}</span>
      </div>
      <Link href={`/notes/${note.id}`} className={`mb-3 block break-words font-serif text-[23px] leading-[1.3] tracking-tight transition group-hover:text-moss ${list ? "sm:col-start-1 sm:row-start-2" : ""}`}><span className="absolute inset-0 rounded-xl" aria-hidden="true" />{note.title}</Link>
      <p className={`pointer-events-none mb-5 line-clamp-3 whitespace-pre-line break-words text-[13px] leading-[1.8] text-[#747b70] ${list ? "sm:col-start-1 sm:row-start-3" : ""}`}>{note.content || "A title is sometimes all you need."}</p>
      <div className={`relative mt-auto flex flex-wrap gap-1.5 ${list ? "sm:col-start-2 sm:row-span-2 sm:row-start-2 sm:mt-0 sm:content-start" : ""}`}>
        {note.tags.map(tag => <button key={tag} onClick={() => onTag(tag)} className="max-w-full truncate rounded-md border border-moss/5 bg-white/55 px-2 py-1 text-[10px] text-moss/80 transition hover:bg-white">#{tag}</button>)}
      </div>
      <div className={`mt-5 flex items-center justify-between border-t border-moss/10 pt-4 ${list ? "sm:col-span-2" : ""}`}>
        <span className="flex min-w-0 items-center gap-2"><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-white/65 text-[9px] font-semibold uppercase">{note.author.slice(0, 1)}</span><span className="truncate text-[11px] text-moss/80">{note.author}</span></span>
        <Icon name="arrow" className="size-4 text-moss/45 transition group-hover:translate-x-1 group-hover:text-moss" />
      </div>
    </article>
  );
}

function NotebookIllustration() {
  return (
    <div aria-hidden="true" className="relative h-48 w-64 shrink-0 select-none">
      <div className="absolute left-9 top-5 h-36 w-40 -rotate-12 rounded-lg border border-[#d8dfcd] bg-[#e6eddb] shadow-sm" />
      <div className="absolute left-16 top-5 h-36 w-40 rotate-12 rounded-lg border border-[#e3ded0] bg-[#f3eee0] shadow-sm" />
      <div className="absolute left-12 top-3 flex h-40 w-40 -rotate-3 flex-col rounded-lg border border-[#dfdfbc] bg-[#f1f2d8] p-5 shadow-[2px_6px_12px_#354b3e0a]">
        <div className="absolute -top-2 left-14 h-5 w-14 rotate-3 bg-[#d4ddba]/60" />
        <Icon name="sparkle" className="mb-3 size-5 text-[#738150]" />
        <span className="font-serif text-[25px] leading-[1.2] text-[#5e6c48]">a thought<br />worth keeping.</span>
        <div className="mt-3 h-px w-16 bg-[#9ca47d]/40" />
      </div>
      <svg className="absolute -right-1 bottom-0 h-14 w-20 text-[#85936f]" viewBox="0 0 80 60" fill="none"><path d="M72 3C55 47 20 57 8 37m0 0 3 15M8 37l16 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
    </div>
  );
}

export default function NotesList({ query, refresh, navigate, session, onNew }: { query: string; refresh: number; navigate: Navigate; session: Session | null; onNew: () => void }) {
  const params = new URLSearchParams(query);
  const search = params.get("q") ?? "";
  const author = params.get("author") ?? "";
  const tag = params.get("tag") ?? "";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const pageSize = [9, 18, 36].includes(Number(params.get("page_size"))) ? Number(params.get("page_size")) : 9;
  const [data, setData] = useState<NotePage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [view, setView] = useState<"grid" | "list">("grid");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const timeout = window.setTimeout(() => {
      const requestParams = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
      if (search) requestParams.set("q", search);
      if (author) requestParams.set("author", author);
      if (tag) requestParams.set("tag", tag);
      api<NotePage>(`/notes?${requestParams}`, { signal: controller.signal }).then(setData).catch(error => {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Unable to load notes.");
      }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, search || author ? 250 : 0);
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [search, author, tag, page, pageSize, refresh, attempt]);

  function filter(field: string, value: string) {
    const next = new URLSearchParams(query);
    if (value) next.set(field, value);
    else next.delete(field);
    if (field !== "page") next.delete("page");
    navigate(next.size ? `/?${next}` : "/", { replace: field === "q" || field === "author", scroll: false });
  }

  const filtered = !!(search || author || tag);
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / pageSize));

  return (
    <>
      <section className="mb-9 flex items-center justify-between gap-6 border-b border-line pb-8">
        <div>
          <div className="mb-4 flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.19em] text-muted"><span className="size-1.5 rounded-full bg-[#829364]" />A public notebook, a personal touch</div>
          <h1 className="font-serif text-[42px] leading-[1.1] tracking-[-0.045em] sm:text-[52px]">Small notes.<br /><span className="text-[#73846a]">Big possibilities.</span></h1>
          <p className="mt-4 max-w-sm text-[13px] leading-6 text-muted">A place for passing thoughts, bright ideas,<br className="hidden sm:block" /> and the little things you want to remember.</p>
        </div>
        <div className="hidden min-[1100px]:block"><NotebookIllustration /></div>
      </section>

      <section aria-label="Browse notes">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3"><h2 className="font-serif text-[27px] tracking-tight">{author && author === session?.username ? "My notes" : tag ? `Notes tagged “${tag}”` : "The notebook"}</h2><span className="rounded-md border border-line bg-white/70 px-2 py-0.5 text-[10px] text-muted">{loading ? "…" : data?.total ?? 0}</span></div>
          <button onClick={onNew} className="flex items-center gap-2 rounded-lg bg-moss px-4 py-2.5 text-xs font-medium text-white shadow-sm transition hover:bg-ink"><Icon name="plus" className="size-4" />New note</button>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative min-w-0 flex-1"><Icon name="search" className="pointer-events-none absolute left-3.5 top-3.5 size-4 text-muted" /><input type="search" aria-label="Search notes" placeholder="Find a thought…" value={search} onChange={event => filter("q", event.target.value)} className="h-11 w-full rounded-lg border border-line bg-white/80 pl-10 pr-4 text-xs placeholder:text-muted focus:border-moss/50 focus:outline-none focus:ring-2 focus:ring-moss/5" /></div>
          <div className="relative sm:w-48"><Icon name="user" className="pointer-events-none absolute left-3.5 top-3.5 size-4 text-muted" /><input aria-label="Filter by author" placeholder="Filter by author" value={author} onChange={event => filter("author", event.target.value)} className="h-11 w-full rounded-lg border border-line bg-white/80 pl-10 pr-8 text-xs placeholder:text-muted focus:border-moss/50 focus:outline-none focus:ring-2 focus:ring-moss/5" />{author && <button aria-label="Clear author filter" onClick={() => filter("author", "")} className="absolute right-2 top-3 rounded p-1 text-muted hover:text-ink"><Icon name="close" className="size-3" /></button>}</div>
          <div className="hidden items-center gap-1 rounded-lg border border-line bg-white/80 p-1 sm:flex"><button aria-label="Grid view" aria-pressed={view === "grid"} onClick={() => setView("grid")} className={`rounded-md p-2 transition ${view === "grid" ? "bg-leaf text-moss" : "text-muted hover:bg-paper"}`}><Icon name="grid" className="size-4" /></button><button aria-label="List view" aria-pressed={view === "list"} onClick={() => setView("list")} className={`rounded-md p-2 transition ${view === "list" ? "bg-leaf text-moss" : "text-muted hover:bg-paper"}`}><Icon name="list" className="size-4" /></button></div>
        </div>

        <div className="mb-5 mt-4 flex flex-wrap items-center justify-between gap-3 text-[10px] text-muted">
          <div className="flex flex-wrap items-center gap-2">{filtered ? <>{tag && <span className="flex items-center gap-2 rounded-md bg-leaf px-2.5 py-1 text-moss">#{tag}<button aria-label="Clear tag filter" onClick={() => filter("tag", "")}><Icon name="close" className="size-3" /></button></span>}<button onClick={() => navigate("/", { scroll: false })} className="underline decoration-muted/30 underline-offset-3 hover:text-ink">Clear filters</button></> : <span>Good thoughts, all in one place.</span>}</div>
          <span className="flex items-center gap-1.5"><Icon name="pin" className="size-3" />Pinned first<span className="mx-1 text-line">/</span>Recently updated</span>
        </div>

        {error ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-10 text-center"><p className="text-sm text-red-700">{error}</p><button onClick={() => setAttempt(value => value + 1)} className="mt-4 rounded-lg border border-red-200 bg-white px-4 py-2 text-xs text-red-700">Try again</button></div> : loading ? <div aria-label="Loading notes" aria-busy="true" className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 3 }, (_, index) => <div key={index} className="h-72 animate-pulse rounded-xl border border-line bg-leaf/35 p-6"><div className="mb-7 h-2 w-20 rounded bg-moss/10" /><div className="mb-3 h-5 w-3/4 rounded bg-moss/10" /><div className="mb-3 h-3 w-full rounded bg-moss/5" /><div className="h-3 w-4/5 rounded bg-moss/5" /></div>)}</div> : data?.items.length ? <div className={`grid gap-5 ${view === "grid" ? "sm:grid-cols-2 xl:grid-cols-3" : "grid-cols-1"}`}>{data.items.map((note, index) => <NoteCard key={note.id} note={note} index={index} list={view === "list"} onTag={tag => filter("tag", tag)} />)}</div> : (
          <div className="relative overflow-hidden rounded-xl border border-dashed border-[#d5ddcc] bg-white/45 px-6 py-12 text-center">
            <div aria-hidden="true" className="mx-auto mb-5 flex size-14 -rotate-6 items-center justify-center rounded-xl border border-[#dce3cc] bg-leaf text-[#7c8d62]"><Icon name={filtered ? "search" : "edit"} className="size-7" /></div>
            <p className="mb-2 text-[9px] font-semibold uppercase tracking-[0.18em] text-muted">{filtered ? "A different direction" : "So many possibilities"}</p>
            <h3 className="font-serif text-[28px] tracking-tight">{filtered ? "No notes on this page." : "Your next idea starts here."}</h3>
            <p className="mx-auto mt-3 max-w-xs text-xs leading-6 text-muted">{filtered ? "Try another search or clear your filters. The thought you’re looking for might be just around the corner." : "Every notebook begins with a single thought. Write the first one and make this space your own."}</p>
            <button onClick={filtered ? () => navigate("/", { scroll: false }) : onNew} className="mx-auto mt-6 flex items-center gap-2 rounded-lg bg-moss px-4 py-2.5 text-xs font-medium text-white transition hover:bg-ink"><Icon name={filtered ? "back" : "plus"} className="size-4" />{filtered ? "See all notes" : "Write the first note"}</button>
            {!filtered && !session && <p className="mt-3 text-[10px] text-muted">Free to read. Yours to contribute.</p>}
          </div>
        )}

        {!loading && !error && !!data?.total && <div className="mt-7 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-5 text-[11px] text-muted">
          <div className="flex items-center gap-4"><span>{data.items.length ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, data.total)}` : "0"} of {data.total} notes</span><label className="hidden items-center gap-2 sm:flex">Per page<select aria-label="Notes per page" value={pageSize} onChange={event => filter("page_size", event.target.value)} className="rounded border border-line bg-white px-2 py-1 text-xs">{[9, 18, 36].map(size => <option key={size} value={size}>{size}</option>)}</select></label></div>
          <div className="flex items-center gap-3"><button aria-label="Previous page" disabled={page <= 1} onClick={() => filter("page", String(page - 1))} className="rounded-lg border border-line bg-white p-2 transition hover:bg-leaf"><Icon name="chevron" className="size-3.5 rotate-180" /></button><span>Page {page} of {pages}</span><button aria-label="Next page" disabled={page >= pages} onClick={() => filter("page", String(page + 1))} className="rounded-lg border border-line bg-white p-2 transition hover:bg-leaf"><Icon name="chevron" className="size-3.5" /></button></div>
        </div>}

        {!loading && !filtered && data?.total === 0 && <div className="mt-7 grid gap-5 sm:grid-cols-3">{[{ icon: "edit" as const, title: "Catch a thought", copy: "Big ideas or everyday reminders. Just start writing." }, { icon: "tag" as const, title: "Give it a little order", copy: "Add a few tags. Find what matters when you need it." }, { icon: "pin" as const, title: "Keep the good ones close", copy: "Pin your favorites so they never get lost in the pages." }].map(item => <div key={item.title} className="flex items-start gap-3 p-1"><div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-line bg-white/50 text-moss/65"><Icon name={item.icon} className="size-4" /></div><div><h3 className="text-[11px] font-medium">{item.title}</h3><p className="mt-1 text-[10px] leading-[1.8] text-muted">{item.copy}</p></div></div>)}</div>}
      </section>
    </>
  );
}

import { useEffect, useState } from "react";
import { ArrowDown, ArrowRight, Bookmark, ChevronLeft, ChevronRight, LayoutGrid, List, LoaderCircle, Search, X } from "lucide-react";
import { api, type Preview, type PreviewPage, type Session } from "../api";
import Dialog from "./Dialog";
import PreviewCard from "./PreviewCard";

const PAGE_SIZE = 9;

export default function Library({ session, revision, onTotal, notify }: {
  session: Session;
  revision: number;
  onTotal: (total: number) => void;
  notify: (message: string) => void;
}) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PreviewPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [refreshing, setRefreshing] = useState<Set<number>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<Preview | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => { setPage(1); }, [revision]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api<PreviewPage>(`/previews?page=${page}&page_size=${PAGE_SIZE}`, {
      token: session.token, signal: controller.signal,
    }).then((result) => {
      setData(result);
      onTotal(result.total);
      const lastPage = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
      if (page > lastPage) setPage(lastPage);
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Unable to load links.");
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [session.token, page, revision, reload, onTotal]);

  async function refresh(preview: Preview) {
    setRefreshing((current) => new Set(current).add(preview.id));
    try {
      const updated = await api<Preview>(`/previews/${preview.id}/refresh`, { token: session.token, method: "POST" });
      setData((current) => current ? { ...current, items: current.items.map((item) => item.id === updated.id ? updated : item) } : current);
      notify("A fresh look at a good find. Preview updated.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to refresh this preview.");
    } finally {
      setRefreshing((current) => {
        const next = new Set(current);
        next.delete(preview.id);
        return next;
      });
    }
  }

  async function remove() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await api(`/previews/${deleteTarget.id}`, { token: session.token, method: "DELETE" });
      setDeleteTarget(null);
      setReload((current) => current + 1);
      notify("Link removed from your library.");
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Unable to delete this link.");
    } finally {
      setDeleting(false);
    }
  }

  const items = (data?.items ?? []).filter((item) => `${item.title} ${item.description} ${item.url}`.toLowerCase().includes(query.toLowerCase()));
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

  return (
    <section aria-labelledby="library-heading">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3"><h2 id="library-heading" className="text-lg font-semibold tracking-tight">Your library</h2><span className="rounded-md bg-sidebar px-2 py-0.5 text-[11px] text-olive">{data?.total ?? 0}</span></div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input aria-label="Search links on this page" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search this page…" className="w-44 rounded-lg border border-line bg-white py-2 pl-9 pr-8 text-xs placeholder:text-muted/70 sm:w-48" />
            {query && <button aria-label="Clear search" onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted"><X size={13} /></button>}
          </div>
          <div className="flex rounded-lg border border-line bg-white p-0.5">
            <button aria-label="Grid view" aria-pressed={view === "grid"} onClick={() => setView("grid")} className={`rounded-md p-1.5 transition ${view === "grid" ? "bg-sidebar text-olive" : "text-muted hover:text-ink"}`}><LayoutGrid size={16} /></button>
            <button aria-label="List view" aria-pressed={view === "list"} onClick={() => setView("list")} className={`rounded-md p-1.5 transition ${view === "list" ? "bg-sidebar text-olive" : "text-muted hover:text-ink"}`}><List size={16} /></button>
          </div>
        </div>
      </div>
      {!loading && !error && (data?.total ?? 0) > 0 && <div className="mb-5 flex items-center justify-between text-[11px] text-muted"><span>{query ? `Searching ${data?.items.length ?? 0} links on this page` : "A collection of things that caught your eye."}</span><span className="flex shrink-0 items-center gap-1.5"><ArrowDown size={12} />Newest first</span></div>}
      {error ? (
        <div role="alert" className="rounded-xl border border-red-100 bg-red-50/50 px-6 py-10 text-center"><p className="text-sm text-red-700">{error}</p><button onClick={() => setReload((current) => current + 1)} className="mt-4 rounded-lg bg-white px-4 py-2 text-sm text-ink shadow-sm">Try again</button></div>
      ) : loading ? (
        <div role="status" aria-label="Loading your links" className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, index) => <div key={index} className="overflow-hidden rounded-xl border border-line bg-white motion-safe:animate-pulse"><div className="aspect-[1.85/1] bg-sidebar" /><div className="space-y-4 p-5"><div className="h-2 w-24 rounded bg-sidebar" /><div className="h-5 w-3/4 rounded bg-sidebar" /><div className="h-3 rounded bg-sidebar" /><div className="h-3 w-2/3 rounded bg-sidebar" /><div className="h-5" /></div></div>)}</div>
      ) : !data?.total ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-olive/25 bg-sidebar/35 px-6 py-16 text-center">
          <span className="mb-5 rotate-[-8deg] rounded-2xl border border-olive/15 bg-white p-5 text-olive"><Bookmark size={30} strokeWidth={1.3} /></span>
          <h3 className="font-serif text-3xl tracking-tight">Room for your first good find.</h3>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted">An article to read. An idea to revisit. A rabbit hole to fall into. It all starts with a link.</p>
          <button onClick={() => document.getElementById("link-url")?.focus()} className="mt-6 flex items-center gap-2 rounded-lg bg-olive px-5 py-2.5 text-sm text-white hover:bg-olive/90">Save your first link<ArrowRight size={15} /></button>
        </div>
      ) : !items.length ? (
        <div className="rounded-xl border border-dashed border-line py-16 text-center"><Search size={25} className="mx-auto mb-4 text-muted" /><h3 className="font-serif text-2xl">No matches on this page.</h3><p className="mt-2 text-sm text-muted">Try a different search or browse another page.</p><button onClick={() => setQuery("")} className="mt-4 rounded-lg px-4 py-2 text-sm text-olive underline underline-offset-4">Clear search</button></div>
      ) : (
        <div className={view === "grid" ? "grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3" : "flex flex-col gap-4"}>
          {items.map((preview) => <PreviewCard key={preview.id} preview={preview} list={view === "list"} refreshing={refreshing.has(preview.id)} onRefresh={() => void refresh(preview)} onDelete={() => { setDeleteError(""); setDeleteTarget(preview); }} />)}
        </div>
      )}
      {!error && (data?.total ?? 0) > 0 && <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5 text-xs text-muted">
        <span>{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, data?.total ?? 0)} of {data?.total} links</span>
        <div className="flex items-center gap-3">
          <button aria-label="Previous page" disabled={page === 1 || loading} onClick={() => { setPage((current) => current - 1); setQuery(""); }} className="flex items-center gap-1 rounded-lg border border-line bg-white px-2.5 py-2 text-ink hover:bg-sidebar disabled:opacity-35"><ChevronLeft size={14} /><span className="hidden sm:inline">Previous</span></button>
          <span>Page {page} of {totalPages}</span>
          <button aria-label="Next page" disabled={page >= totalPages || loading} onClick={() => { setPage((current) => current + 1); setQuery(""); }} className="flex items-center gap-1 rounded-lg border border-line bg-white px-2.5 py-2 text-ink hover:bg-sidebar disabled:opacity-35"><span className="hidden sm:inline">Next</span><ChevronRight size={14} /></button>
        </div>
      </div>}
      {deleteTarget && <Dialog title="Let this one go?" onClose={() => setDeleteTarget(null)} busy={deleting}>
        <p className="mt-4 text-sm leading-relaxed text-muted">“{deleteTarget.title || deleteTarget.url}” will be removed from your library. You can always save it again later.</p>
        {deleteError && <p role="alert" className="mt-4 text-sm text-red-700">{deleteError}</p>}
        <div className="mt-7 flex justify-end gap-3"><button disabled={deleting} onClick={() => setDeleteTarget(null)} className="rounded-lg border border-line px-4 py-2.5 text-sm hover:bg-sidebar">Keep it</button><button disabled={deleting} onClick={() => void remove()} className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm text-white hover:bg-red-700 disabled:opacity-60">{deleting && <LoaderCircle size={15} className="animate-spin motion-reduce:animate-none" />}Delete link</button></div>
      </Dialog>}
    </section>
  );
}

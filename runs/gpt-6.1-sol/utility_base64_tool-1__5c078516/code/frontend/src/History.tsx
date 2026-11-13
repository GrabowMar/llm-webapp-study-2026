import { useEffect, useState } from "react";
import { api, ApiError, errorMessage } from "./api";
import type { HistoryPage } from "./api";
import Icon from "./icons";

function formatDate(value: string) {
  const date = new Date(value);
  const today = new Date();
  const day = date.toDateString() === today.toDateString() ? "Today" : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${day}, ${date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
}

export default function History({ token, refresh, onExpired }: { token: string; refresh: number; onExpired: () => void }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [data, setData] = useState<HistoryPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [deleting, setDeleting] = useState<number | null>(null);

  useEffect(() => { setPage(1); }, [refresh]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api<HistoryPage>(`/conversions?page=${page}&page_size=${pageSize}`, {}, token)
      .then((data) => { if (active) setData(data); })
      .catch((error) => {
        if (!active) return;
        if (error instanceof ApiError && error.status === 401) onExpired();
        else setError(errorMessage(error));
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, page, pageSize, refresh, reload, onExpired]);

  async function remove(id: number) {
    setDeleting(id);
    setError("");
    try {
      await api(`/conversions/${id}`, { method: "DELETE" }, token);
      if (data && data.items.length === 1 && page > 1) setPage(page - 1);
      else setReload((value) => value + 1);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) onExpired();
      else setError(errorMessage(error));
    } finally {
      setDeleting(null);
    }
  }

  const pages = Math.max(1, Math.ceil((data?.total || 0) / pageSize));

  return <section id="history" className="scroll-mt-8 overflow-hidden rounded-xl border border-line bg-white shadow-[0_4px_20px_-12px_rgba(32,53,45,0.1)]">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-5">
      <div className="flex items-center gap-3"><Icon name="history" className="h-5 w-5 text-forest" /><h2 className="text-base font-semibold">Your history</h2><span className="rounded-md bg-paper px-2 py-0.5 text-xs text-muted">{data?.total ?? "—"}</span></div>
      <span className="flex items-center gap-1.5 text-xs text-muted"><Icon name="lock" className="h-3.5 w-3.5" />Only visible to you</span>
    </div>
    {error && <div role="alert" className="m-5 flex items-center justify-between gap-4 rounded-lg bg-red-50 p-3 text-sm text-red-700"><span>{error}</span><button onClick={() => setReload((value) => value + 1)} className="font-medium underline">Retry</button></div>}
    {loading && !data ? <p role="status" className="px-6 py-16 text-center text-sm text-muted">Loading your history…</p> : !data?.items.length ? <div className="flex flex-col items-center px-6 py-12 text-center"><span className="mb-4 rounded-xl bg-mint p-3 text-forest"><Icon name="history" className="h-6 w-6" /></span><h3 className="text-sm font-semibold">A fresh start.</h3><p className="mt-2 max-w-sm text-sm leading-6 text-muted">Turn on “Save to history” and convert something. It’ll be waiting for you right here.</p></div> : <div aria-busy={loading} className={loading ? "opacity-50" : ""}>
      <div className="hidden grid-cols-[100px_minmax(0,1fr)_minmax(0,1fr)_140px_32px] gap-5 border-b border-line bg-paper/60 px-6 py-3 text-[10px] font-medium uppercase tracking-wider text-muted md:grid"><span>Conversion</span><span>Input</span><span>Output</span><span>Saved</span><span /></div>
      {data.items.map((item) => <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_32px] items-center gap-x-5 gap-y-3 border-b border-line/70 px-6 py-4 last:border-0 md:grid-cols-[100px_minmax(0,1fr)_minmax(0,1fr)_140px_32px]">
        <span className={`flex w-fit items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-medium ${item.direction === "encode" ? "bg-mint text-forest" : "bg-[#eff0f7] text-[#64628b]"}`}><Icon name="arrow" className={`h-3 w-3 ${item.direction === "decode" ? "rotate-180" : ""}`} />{item.direction === "encode" ? "Encode" : "Decode"}</span>
        <p title={item.input_preview} className="col-start-1 min-w-0 truncate font-mono text-xs text-ink/75 md:col-auto"><span className="mr-2 font-sans text-[10px] text-muted md:hidden">IN</span>{item.input_preview || <span className="font-sans italic text-muted">Empty text</span>}</p>
        <p title={item.output_preview} className="col-start-1 min-w-0 truncate font-mono text-xs text-forest md:col-auto"><span className="mr-2 font-sans text-[10px] text-muted md:hidden">OUT</span>{item.output_preview || <span className="font-sans italic text-muted">Empty text</span>}</p>
        <time dateTime={item.created_at} className="col-start-1 text-[11px] text-muted md:col-auto">{formatDate(item.created_at)}</time>
        <button disabled={deleting !== null || loading} onClick={() => void remove(item.id)} aria-label={`Delete conversion ${item.id}`} className="col-start-2 row-start-1 rounded-md p-2 text-muted transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-40 md:col-auto"><Icon name="trash" /></button>
      </div>)}
    </div>}
    <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line px-6 py-4 text-xs text-muted">
      <label className="flex items-center gap-2">Rows per page <select aria-label="Rows per page" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} className="rounded-md border border-line bg-white p-1 text-ink"><option value={5}>5</option><option value={10}>10</option><option value={20}>20</option></select></label>
      <div className="flex items-center gap-4"><span>Page {page} of {pages}</span><div className="flex gap-1"><button aria-label="Previous page" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)} className="rounded-md border border-line p-1.5 text-ink hover:bg-paper disabled:opacity-30"><Icon name="chevron" className="h-4 w-4 rotate-180" /></button><button aria-label="Next page" disabled={page >= pages || loading} onClick={() => setPage(page + 1)} className="rounded-md border border-line p-1.5 text-ink hover:bg-paper disabled:opacity-30"><Icon name="chevron" /></button></div></div>
    </div>
  </section>;
}

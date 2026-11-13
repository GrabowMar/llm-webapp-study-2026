import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent, ReactNode } from "react";
import {
  ArrowDownToLine, ArrowRight, Check, CheckCheck, ChevronDown, ChevronLeft,
  ChevronRight, CircleAlert, CircleCheck, Code2, Command, FileCode2, FileText,
  FolderClock, History, Info, LoaderCircle, LockKeyhole, LogOut, Play,
  RotateCcw, ShieldCheck, Sparkles, Trash2, Upload, X,
} from "lucide-react";
import { api, ApiError } from "./api";
import type { HistoryPage, SavedValidation, Validation } from "./api";

const EXAMPLES = {
  catalog: `<?xml version="1.0" encoding="UTF-8"?>
<catalog>
  <book id="bk101">
    <title>The Art of Simplicity</title>
    <author>Alex Morgan</author>
    <genre>Design</genre>
    <price currency="USD">29.00</price>
  </book>
  <book id="bk102">
    <title>A Little More Clarity</title>
    <author>Jamie Chen</author>
    <genre>Technology</genre>
    <price currency="USD">24.00</price>
  </book>
</catalog>`,
  broken: `<?xml version="1.0" encoding="UTF-8"?>
<catalog>
  <book id="bk101">
    <title>The Art of Simplicity</title>
    <author>Alex Morgan</author>
    <genre>Design</genre>
  </magazine>
</catalog>`,
  namespaces: `<?xml version="1.0" encoding="UTF-8"?>
<library:catalog xmlns:library="urn:library">
  <library:book id="1">
    <library:title>A World of Possibilities</library:title>
  </library:book>
</library:catalog>`,
};

const primaryButton = "inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-[13px] font-semibold text-white shadow-[0_2px_3px_0_#1b614d15] transition hover:bg-brand-700 disabled:opacity-50";
const secondaryButton = "inline-flex items-center justify-center gap-2 rounded-lg border border-[#e1e7e3] bg-white px-3.5 py-2 text-[13px] font-medium text-[#52605b] transition hover:border-brand-200 hover:bg-brand-50 disabled:opacity-40";

function Brand({ small = false }: { small?: boolean }) {
  return <span className="inline-flex items-center gap-2.5">
    <span className={`flex items-center justify-center rounded-[10px] bg-brand-600 text-white ${small ? "size-7" : "size-9"}`}><Code2 size={small ? 18 : 23} strokeWidth={2} /></span>
    <span className={`${small ? "text-[15px]" : "text-xl"} font-bold tracking-[-0.7px]`}>XML<span className="font-medium">Check</span><span className="text-brand-500">.</span></span>
  </span>;
}

function SyntaxLine({ text }: { text: string }) {
  const tokens = text.split(/(<\?[^>]*\?>|<!--[\s\S]*?-->|<[^>]*>)/g);
  return <>{tokens.map((token, index) => {
    if (token.startsWith("<?") || token.startsWith("<!--")) return <span key={index} className="text-[#96a39b]">{token}</span>;
    if (token.startsWith("<")) {
      const parts = token.split(/("[^"]*"|'[^']*'|[\w:.-]+(?==))/g);
      return <span key={index} className="text-[#34866d]">{parts.map((part, i) => <span key={i} className={part.startsWith('"') || part.startsWith("'") ? "text-[#b28a52]" : /^[\w:.-]+$/.test(part) ? "text-[#6b8f80]" : ""}>{part}</span>)}</span>;
    }
    return <span key={index} className="text-[#4e5c57]">{token}</span>;
  })}</>;
}

function AuthDialog({ mode, onClose, onModeChange, onAuthenticated }: {
  mode: "login" | "register";
  onClose: () => void;
  onModeChange: (mode: "login" | "register") => void;
  onAuthenticated: (token: string, username: string) => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => { dialog.current?.showModal(); }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body = JSON.stringify({ username, password });
      if (mode === "register") await api("/auth/register", { method: "POST", body });
      const session = await api<{ token: string }>("/auth/login", { method: "POST", body });
      const user = await api<{ username: string }>("/auth/me", {}, session.token);
      onAuthenticated(session.token, user.username);
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to sign in. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return <dialog ref={dialog} onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }} aria-labelledby="auth-title" className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-[430px] rounded-2xl border-0 bg-white p-0 text-ink shadow-2xl backdrop:bg-[#152c24]/35 backdrop:backdrop-blur-sm">
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between"><Brand small /><button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1.5 text-muted hover:bg-brand-50"><X size={19} /></button></div>
      <span className="mb-4 flex size-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><FolderClock size={23} /></span>
      <h2 id="auth-title" className="text-2xl font-semibold tracking-tight">{mode === "register" ? "Make room for your XML." : "Welcome back."}</h2>
      <p className="mt-2 text-sm leading-6 text-muted">{mode === "register" ? "Create a free account to keep a private history of your checks." : "Sign in to pick up where you left off."}</p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <div><label htmlFor="username" className="mb-1.5 block text-[13px] font-medium">Username</label><input id="username" value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" autoFocus required maxLength={80} placeholder="Your username" className="w-full rounded-lg border border-[#dde5df] px-3.5 py-3 text-sm placeholder:text-[#a4ada7]" /></div>
        <div><label htmlFor="password" className="mb-1.5 block text-[13px] font-medium">Password</label><input id="password" type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete={mode === "register" ? "new-password" : "current-password"} required maxLength={1024} placeholder="Your password" className="w-full rounded-lg border border-[#dde5df] px-3.5 py-3 text-sm placeholder:text-[#a4ada7]" /></div>
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-[13px] text-red-700">{error}</p>}
        <button type="submit" disabled={busy} className={`${primaryButton} w-full py-3`}>{busy ? <LoaderCircle size={16} className="animate-spin" /> : null}{mode === "register" ? "Create account" : "Sign in"}<ArrowRight size={16} /></button>
      </form>
      <p className="mt-5 text-center text-[13px] text-muted">{mode === "register" ? "Already have an account?" : "New around here?"} <button type="button" onClick={() => { setError(""); onModeChange(mode === "register" ? "login" : "register"); }} className="font-semibold text-brand-600 hover:underline">{mode === "register" ? "Sign in" : "Create an account"}</button></p>
      <div className="mt-6 flex items-center justify-center gap-1.5 border-t border-[#edf0ee] pt-5 text-[11px] text-muted"><LockKeyhole size={12} />Your saved checks are only visible to you.</div>
    </div>
  </dialog>;
}

function ResultPanel({ result, busy, saved, onJump }: { result: Validation | null; busy: boolean; saved: boolean; onJump: () => void }) {
  return <section aria-labelledby="result-heading" className="flex min-h-[440px] flex-col overflow-hidden rounded-xl border border-[#e0e7e2] bg-white shadow-[0_2px_6px_#1b352805] lg:min-h-0">
    <div className="flex h-[65px] items-center justify-between border-b border-[#edf0ee] px-5"><h2 id="result-heading" className="text-[14px] font-semibold">Validation result</h2><span className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-medium ${busy ? "bg-brand-50 text-brand-600" : result ? result.valid ? "bg-brand-50 text-brand-600" : "bg-red-50 text-red-600" : "bg-[#f5f7f5] text-muted"}`}><span className={`size-1.5 rounded-full ${busy ? "animate-pulse bg-brand-500" : result ? result.valid ? "bg-brand-500" : "bg-red-500" : "bg-[#aab5ae]"}`} />{busy ? "Checking" : result ? "Complete" : "Awaiting check"}</span></div>
    <div aria-live="polite" className="flex flex-1 flex-col px-6 py-8">
      {busy ? <div className="flex flex-1 flex-col items-center justify-center gap-5"><LoaderCircle className="animate-spin text-brand-600" size={40} /><p className="text-sm text-muted">Looking at the details…</p></div> : result ? <>
        <div className={`mb-6 flex size-14 items-center justify-center rounded-2xl ${result.valid ? "bg-brand-50 text-brand-600" : "bg-red-50 text-red-500"}`}>{result.valid ? <CircleCheck size={29} strokeWidth={1.7} /> : <CircleAlert size={29} strokeWidth={1.7} />}</div>
        <div><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold ${result.valid ? "bg-brand-100/70 text-brand-700" : "bg-red-50 text-red-600"}`}>{result.valid ? <Check size={13} /> : <X size={13} />}{result.valid ? "Well-formed" : "Not well-formed"}</span></div>
        <h3 className="mt-4 text-[21px] font-semibold tracking-[-0.5px]">{result.valid ? "Everything is in its place." : "One detail needs a fix."}</h3>
        <p className="mt-2 text-[13px] leading-[1.8] text-muted">{result.valid ? "Your XML has valid syntax, with correctly matched and nested elements." : "We found the first syntax error. Fix it and check again to keep going."}</p>
        <div className={`mt-6 rounded-lg border p-4 ${result.valid ? "border-[#e1e9e3] bg-[#f8faf8]" : "border-red-100 bg-red-50/50"}`}>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[1.1px] text-muted">{result.valid ? "Root element" : "First error"}</p>
          {result.valid ? <code className="break-all font-mono text-[14px] text-brand-600">&lt;{result.root_element}&gt;</code> : <><p className="text-[13px] font-medium text-red-700">{result.error}</p><button onClick={onJump} className="mt-3 flex items-center gap-1.5 text-[12px] text-red-600 hover:underline">Line {result.line}, column {result.column}<ArrowRight size={13} /></button></>}
        </div>
        <p className="mt-auto flex items-center gap-1.5 pt-6 text-[11px] text-muted">{saved ? <><CheckCheck size={14} className="text-brand-600" />Saved to your private history</> : <><ShieldCheck size={14} />This check wasn’t stored</>}</p>
      </> : <>
        <div className="flex flex-1 flex-col items-center justify-center pb-5 pt-2 text-center">
          <div className="relative mb-6 flex size-[90px] items-center justify-center rounded-[25px] border border-[#e2ece5] bg-[#f0f6f1] text-brand-600"><FileCode2 size={39} strokeWidth={1.35} /><span className="absolute -bottom-1.5 -right-1.5 flex size-8 items-center justify-center rounded-full border-[4px] border-white bg-brand-600 text-white"><Check size={13} strokeWidth={2.5} /></span><span className="absolute -right-5 top-2 size-1.5 rounded-full bg-brand-200" /><span className="absolute -left-4 bottom-3 size-1 rounded-full bg-[#d0ddd3]" /></div>
          <h3 className="text-lg font-semibold tracking-[-0.4px]">Ready when you are.</h3>
          <p className="mt-2 max-w-[240px] text-[13px] leading-6 text-muted">Add your XML and hit <span className="font-medium text-[#5a6b60]">Check XML</span>.<br />We’ll take a look at the syntax.</p>
        </div>
        <div className="space-y-3.5 rounded-lg bg-[#f8faf8] p-4">{["Matching opening & closing tags", "Correctly nested elements", "Well-formed XML syntax"].map(text => <p key={text} className="flex items-center gap-2.5 text-[11px] text-[#728077]"><span className="flex size-4 items-center justify-center rounded-full bg-[#e7eee8] text-[#7e9b86]"><Check size={10} strokeWidth={2} /></span>{text}</p>)}</div>
      </>}
    </div>
    <div className="flex items-center justify-center gap-1.5 border-t border-[#edf0ee] bg-[#fdfefd] px-4 py-3.5 text-[10px] text-[#8b978e]"><Info size={12} />Well-formedness only. No schema validation.</div>
  </section>;
}

function HistorySection({ token, onAuth, refreshKey, onSessionExpired }: { token: string; onAuth: (mode: "login" | "register") => void; refreshKey: number; onSessionExpired: () => void }) {
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [history, setHistory] = useState<HistoryPage | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [localRefresh, setLocalRefresh] = useState(0);

  useEffect(() => {
    if (!token) return;
    let active = true;
    const query = new URLSearchParams({ page: String(page), page_size: "5" });
    if (filter !== "all") query.set("valid", filter);
    async function load() {
      setBusy(true);
      setError("");
      try {
        const data = await api<HistoryPage>(`/validations?${query}`, {}, token);
        if (active) {
          if (data.items.length === 0 && page > 1 && data.total > 0) setPage(Math.ceil(data.total / data.page_size));
          else if (data.total === 0 && page > 1) setPage(1);
          else setHistory(data);
        }
      } catch (error) {
        if (active) {
          if (error instanceof ApiError && error.status === 401) onSessionExpired();
          setError(error instanceof Error ? error.message : "Could not load your history.");
        }
      } finally {
        if (active) setBusy(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [token, page, filter, refreshKey, localRefresh, onSessionExpired]);

  async function remove(item: SavedValidation) {
    if (!window.confirm("Delete this saved check? This cannot be undone.")) return;
    setDeleting(item.id);
    setError("");
    try {
      await api(`/validations/${item.id}`, { method: "DELETE" }, token);
      setLocalRefresh(value => value + 1);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) onSessionExpired();
      setError(error instanceof Error ? error.message : "Could not delete this check.");
    } finally {
      setDeleting(null);
    }
  }

  return <section id="history" aria-labelledby="history-heading" className="scroll-mt-6">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2.5"><History size={18} className="text-[#74867b]" /><h2 id="history-heading" className="text-[16px] font-semibold tracking-[-0.3px]">Your saved checks</h2><span className="ml-1 flex items-center gap-1 rounded-md border border-[#e4e9e5] px-1.5 py-0.5 text-[9px] font-medium text-[#86948a]"><LockKeyhole size={9} />PRIVATE</span></div>{token ? <div className="flex items-center gap-2"><label htmlFor="filter" className="text-[12px] text-muted">Show</label><div className="relative"><select id="filter" value={filter} onChange={event => { setFilter(event.target.value); setPage(1); }} className="appearance-none rounded-lg border border-[#e0e7e2] bg-white py-2 pl-3 pr-8 text-xs"><option value="all">All checks</option><option value="true">Well-formed</option><option value="false">Not well-formed</option></select><ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-2.5 text-muted" /></div></div> : <span className="text-[12px] text-[#89958c]">A little history. A lot of clarity.</span>}</div>
    <div className="overflow-hidden rounded-xl border border-[#e0e7e2] bg-white shadow-[0_2px_6px_#1b352805]">
      {!token ? <div className="flex flex-col items-center gap-5 px-7 py-8 text-center sm:flex-row sm:gap-6 sm:text-left"><div className="relative flex size-[76px] shrink-0 items-center justify-center rounded-2xl border border-[#e1eae3] bg-[#f5f8f4]"><FolderClock size={34} className="text-[#7da18b]" strokeWidth={1.35} /><span className="absolute -bottom-1.5 -right-1.5 flex size-7 items-center justify-center rounded-full border-[3px] border-white bg-[#e7eee7] text-[#6f8e79]"><LockKeyhole size={11} /></span></div><div className="flex-1"><h3 className="text-[16px] font-semibold tracking-[-0.3px]">Good work deserves a paper trail.</h3><p className="mt-1.5 max-w-[570px] text-[13px] leading-6 text-muted">Save your checks, revisit results, and keep everything in one place.<br className="hidden md:block" />Create an account to start your own private history.</p></div><button onClick={() => onAuth("register")} className={`${secondaryButton} shrink-0 border-brand-200 text-brand-600`}>Create free account<ArrowRight size={14} /></button></div> : <>
        {error && <div role="alert" className="flex items-center justify-between gap-3 border-b border-red-100 bg-red-50 px-5 py-3 text-[13px] text-red-700"><span>{error}</span><button onClick={() => setLocalRefresh(value => value + 1)} className="font-medium underline">Retry</button></div>}
        {busy ? <div className="flex min-h-[160px] items-center justify-center gap-2 text-sm text-muted"><LoaderCircle size={17} className="animate-spin" />Loading your checks…</div> : history?.items.length ? <div className="relative overflow-x-auto"><table className="w-full min-w-[680px] text-left"><thead className="border-b border-[#edf0ee] bg-[#fafbf9] text-[10px] uppercase tracking-[0.8px] text-[#8b978e]"><tr><th className="px-5 py-3 font-medium">Document preview</th><th className="px-4 py-3 font-medium">Result</th><th className="px-4 py-3 font-medium">Checked</th><th className="w-14 px-4 py-3"><span className="sr-only">Actions</span></th></tr></thead><tbody>{history.items.map(item => <tr key={item.id} className="border-b border-[#edf0ee] last:border-b-0 hover:bg-[#fafcf9]"><td className="max-w-[350px] px-5 py-4"><div className="flex items-start gap-3"><span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-[#e6ece6] text-[#819887]"><FileCode2 size={16} /></span><div className="min-w-0"><p className="text-[12px] font-medium">{item.root_element ? `<${item.root_element}>` : "XML document"}</p><code title={item.xml_preview} className="mt-1 block truncate font-mono text-[10px] text-[#87948b]">{item.xml_preview || "(empty document)"}</code></div></div></td><td className="px-4 py-4"><span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium ${item.valid ? "bg-brand-50 text-brand-600" : "bg-red-50 text-red-600"}`}>{item.valid ? <Check size={11} /> : <X size={11} />}{item.valid ? "Well-formed" : "Not well-formed"}</span>{!item.valid && <p title={item.error ?? ""} className="mt-1 max-w-[210px] truncate text-[10px] text-muted">Line {item.line}:{item.column} · {item.error}</p>}</td><td className="px-4 py-4 text-[11px] text-muted"><span className="block">{new Date(item.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span><span className="mt-1 block text-[10px] text-[#9aa59d]">{new Date(item.created_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span></td><td className="px-4 py-4"><button onClick={() => void remove(item)} disabled={deleting === item.id} aria-label={`Delete saved check ${item.id}`} className="rounded-md p-2 text-[#96a198] transition hover:bg-red-50 hover:text-red-600">{deleting === item.id ? <LoaderCircle size={15} className="animate-spin" /> : <Trash2 size={15} />}</button></td></tr>)}</tbody></table></div> : <div className="flex min-h-[165px] flex-col items-center justify-center px-6 py-7 text-center"><FolderClock size={28} strokeWidth={1.5} className="mb-3 text-[#8fab96]" /><h3 className="text-sm font-medium">{filter === "all" ? "Your history starts here." : "No matching checks yet."}</h3><p className="mt-1.5 text-[12px] text-muted">{filter === "all" ? "Turn on “Save to history” and check a document to add your first result." : "Try another filter, or save a new XML check."}</p></div>}
        <div className="flex items-center justify-between border-t border-[#edf0ee] px-5 py-3.5"><span className="text-[11px] text-muted">{history?.total ?? 0} saved {(history?.total ?? 0) === 1 ? "check" : "checks"}<span className="mx-2 text-[#d3dbd5]">·</span>Only you can see these</span><div className="flex items-center gap-3"><span className="text-[11px] text-muted">{page} / {Math.max(1, Math.ceil((history?.total ?? 0) / 5))}</span><button disabled={busy || page === 1} onClick={() => setPage(value => value - 1)} aria-label="Previous page" className="rounded-md border border-[#e1e7e2] p-1.5 text-muted hover:bg-brand-50 disabled:opacity-35"><ChevronLeft size={14} /></button><button disabled={busy || page * 5 >= (history?.total ?? 0)} onClick={() => setPage(value => value + 1)} aria-label="Next page" className="-ml-1 rounded-md border border-[#e1e7e2] p-1.5 text-muted hover:bg-brand-50 disabled:opacity-35"><ChevronRight size={14} /></button></div></div>
      </>}
    </div>
  </section>;
}

export default function App() {
  const [xml, setXml] = useState<string>(EXAMPLES.catalog);
  const [filename, setFilename] = useState("untitled.xml");
  const [result, setResult] = useState<Validation | null>(null);
  const [saved, setSaved] = useState(false);
  const [save, setSave] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "register" | null>(null);
  const [token, setToken] = useState(() => localStorage.getItem("xmlcheck-token") || "");
  const [username, setUsername] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [cursorLine, setCursorLine] = useState(1);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const highlight = useRef<HTMLDivElement>(null);
  const gutter = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const xmlRef = useRef(xml);
  const busyRef = useRef(false);
  const tokenRef = useRef(token);
  const lines = xml.replace(/\r\n?/g, "\n").split("\n");

  const clearSession = useCallback(() => {
    localStorage.removeItem("xmlcheck-token");
    tokenRef.current = "";
    setToken("");
    setUsername("");
    setSave(false);
  }, []);

  const sessionExpired = useCallback(() => {
    clearSession();
    setNotice("Your session has expired. Sign in again to access your history.");
  }, [clearSession]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    api<{ username: string }>("/auth/me", {}, token).then(user => {
      if (active) setUsername(user.username);
    }).catch(error => {
      if (!active) return;
      if (error instanceof ApiError && error.status === 401) sessionExpired();
      else setNotice("Could not connect to your account. Please try again.");
    });
    return () => { active = false; };
  }, [token, sessionExpired]);

  function updateXml(value: string, name?: string) {
    const normalized = value.replace(/\r\n?/g, "\n");
    xmlRef.current = normalized;
    setXml(normalized);
    if (name) setFilename(name);
    setResult(null);
    setSaved(false);
    setNotice("");
    setCursorLine(1);
  }

  async function check() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setNotice("");
    setSaved(false);
    const submitted = xml;
    const usedToken = token;
    const shouldSave = Boolean(token && save);
    try {
      const response = await api<Validation>(shouldSave ? "/validations" : "/validate/xml", { method: "POST", body: JSON.stringify({ xml: submitted }) }, shouldSave ? token : undefined);
      if (shouldSave && tokenRef.current === usedToken) setRefreshKey(value => value + 1);
      if (xmlRef.current === submitted) {
        setResult(response);
        setSaved(shouldSave);
        if (!response.valid) window.requestAnimationFrame(() => jumpToError(response));
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) sessionExpired();
      else setNotice(error instanceof Error ? error.message : "Could not check this XML. Please try again.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function jumpToError(validation: Validation | null = result) {
    if (!validation?.line || !textarea.current) return;
    const offset = lines.slice(0, validation.line - 1).reduce((total, line) => total + line.length + 1, 0);
    const position = offset + Math.max(0, (validation.column ?? 1) - 1);
    textarea.current.focus({ preventScroll: true });
    textarea.current.setSelectionRange(position, position);
    textarea.current.scrollTop = Math.max(0, (validation.line - 1) * 24 - 96);
    syncScroll();
    setCursorLine(validation.line);
  }

  function syncScroll() {
    if (!textarea.current) return;
    if (highlight.current) {
      highlight.current.scrollTop = textarea.current.scrollTop;
      highlight.current.scrollLeft = textarea.current.scrollLeft;
    }
    if (gutter.current) gutter.current.scrollTop = textarea.current.scrollTop;
  }

  function editorKeydown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      void check();
    }
    if (event.key === "Tab") {
      event.preventDefault();
      const { selectionStart, selectionEnd } = event.currentTarget;
      updateXml(`${xml.slice(0, selectionStart)}  ${xml.slice(selectionEnd)}`);
      requestAnimationFrame(() => textarea.current?.setSelectionRange(selectionStart + 2, selectionStart + 2));
    }
  }

  async function loadFile(file?: File) {
    if (!file) return;
    if (file.size > 1_000_000) { setNotice("Choose an XML file smaller than 1 MB."); return; }
    try { updateXml(await file.text(), file.name); }
    catch { setNotice("Could not read that file. Please try another file."); }
    if (fileInput.current) fileInput.current.value = "";
  }

  function download() {
    const url = URL.createObjectURL(new Blob([xml], { type: "application/xml" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function signOut() {
    const previousToken = token;
    clearSession();
    try { await api("/auth/logout", { method: "POST" }, previousToken); }
    catch { setNotice("You’re signed out on this device. The server could not revoke the session; it will expire automatically."); }
  }

  function openHistory() {
    if (!token) setAuthMode("login");
    else document.getElementById("history")?.scrollIntoView({ behavior: "smooth" });
  }

  let saveControl: ReactNode;
  if (token) saveControl = <label className="flex cursor-pointer items-center gap-2.5 text-[12px] text-[#66786b]"><button type="button" role="switch" aria-checked={save} aria-label="Save to history" onClick={() => setSave(value => !value)} className={`flex h-[19px] w-[33px] items-center rounded-full p-[3px] transition ${save ? "bg-brand-600" : "bg-[#dce3dd]"}`}><span className={`size-[13px] rounded-full bg-white shadow-sm transition-transform ${save ? "translate-x-[14px]" : "translate-x-0"}`} /></button>Save to history</label>;
  else saveControl = <button onClick={() => setAuthMode("login")} className="flex items-center gap-1.5 text-[12px] text-[#7b8a80] hover:text-brand-600"><LockKeyhole size={12} /><span><span className="font-medium underline decoration-[#bccbc0] underline-offset-2">Sign in</span> to save your checks</span></button>;

  return <div className="min-h-screen">
    <header className="border-b border-[#e5eae6] bg-white">
      <div className="mx-auto flex h-[76px] max-w-[1336px] items-center justify-between gap-4 px-5 sm:px-8 lg:px-10">
        <div className="flex h-full items-center gap-10 lg:gap-14"><a href="#" aria-label="XMLCheck home"><Brand /></a><nav aria-label="Main navigation" className="hidden h-full items-center gap-7 sm:flex"><a href="#workspace" className="relative flex h-full items-center gap-2 text-[13px] font-medium text-brand-600 after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:bg-brand-600"><Code2 size={15} />Workspace</a><button onClick={openHistory} className="flex items-center gap-2 text-[13px] text-muted transition hover:text-brand-600"><History size={15} />History{!token && <LockKeyhole size={11} className="ml-0.5 text-[#a8b3aa]" />}</button></nav></div>
        <div className="flex items-center gap-3 sm:gap-5"><span className="hidden items-center gap-1.5 text-[11px] text-[#8a978e] lg:flex"><span className="size-1.5 rounded-full bg-brand-500" />A little clarity for your XML</span><span className="hidden h-5 w-px bg-[#e6ebe6] lg:block" />{token ? <><span className="flex items-center gap-2 text-[12px] font-medium"><span className="flex size-7 items-center justify-center rounded-full bg-brand-100 text-[11px] text-brand-700">{(username || "U")[0].toUpperCase()}</span><span className="max-w-[100px] truncate">{username || "…"}</span></span><button onClick={() => void signOut()} aria-label="Sign out" className="flex items-center gap-1.5 rounded-md p-1.5 text-[12px] text-muted hover:text-brand-600"><LogOut size={15} /><span className="hidden md:inline">Sign out</span></button></> : <><button onClick={() => setAuthMode("login")} className="text-[13px] font-medium text-[#53635a] hover:text-brand-600">Sign in</button><button onClick={() => setAuthMode("register")} className={`${primaryButton} px-3.5 py-2.5`}>Get started<ArrowRight size={14} className="hidden sm:block" /></button></>}</div>
      </div>
    </header>

    <main id="workspace" className="mx-auto max-w-[1336px] px-5 pb-10 pt-10 sm:px-8 lg:px-10 lg:pt-12">
      <div className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-center lg:mb-9">
        <div><div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[1.8px] text-[#708b78]"><span className="h-px w-5 bg-[#93b69d]" />Less guesswork. More confidence.</div><h1 className="text-[31px] font-semibold leading-tight tracking-[-1.3px] sm:text-[36px]">Good XML starts here<span className="text-brand-500">.</span></h1><p className="mt-3 text-[13px] leading-6 text-[#7c8980] sm:text-[14px]">Check your XML, find the first error, and get back to building.</p></div>
        <div className="flex items-center gap-3 self-start rounded-xl border border-[#e0e9e1] bg-[#f0f5ef] px-4 py-3.5 md:self-auto"><span className="flex size-9 items-center justify-center rounded-lg border border-[#dce8db] bg-white/70 text-[#71927a]"><ShieldCheck size={19} strokeWidth={1.7} /></span><div><p className="text-[12px] font-semibold text-[#506b55]">Just syntax. Nothing else.</p><p className="mt-1 text-[10px] text-[#8a9b8b]">No schemas. No external requests.</p></div></div>
      </div>

      {notice && <div role="alert" className="mb-5 flex items-start justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800"><span className="flex items-center gap-2"><CircleAlert size={16} className="shrink-0" />{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss message" className="rounded p-0.5"><X size={15} /></button></div>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_335px] xl:grid-cols-[minmax(0,1fr)_355px]">
        <section aria-labelledby="editor-heading" className="min-w-0 overflow-hidden rounded-xl border border-[#e0e7e2] bg-white shadow-[0_2px_6px_#1b352805]">
          <div className="flex h-[65px] items-center justify-between gap-3 border-b border-[#edf0ee] px-5"><div className="flex items-center gap-2.5"><FileCode2 size={17} className="text-[#70867a]" /><h2 id="editor-heading" className="text-[14px] font-semibold">XML document</h2><span className="ml-1 hidden rounded-md border border-[#e6eae6] bg-[#f8faf8] px-1.5 py-0.5 font-mono text-[9px] text-[#97a299] sm:inline">.xml</span></div><div className="flex items-center gap-3"><input ref={fileInput} type="file" accept=".xml,.txt,.svg,.xhtml,.rss,.atom,application/xml,text/xml,text/plain" onChange={event => void loadFile(event.target.files?.[0])} className="hidden" aria-label="Load XML file" /><button onClick={() => fileInput.current?.click()} className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[12px] text-[#6d7e72] hover:bg-brand-50 hover:text-brand-600"><Upload size={14} /><span className="hidden sm:inline">Load file</span></button><span className="h-4 w-px bg-[#e6ebe6]" /><button onClick={() => updateXml("", "untitled.xml")} aria-label="Clear XML" className="flex items-center gap-1.5 rounded-md py-1.5 text-[12px] text-[#8c988f] hover:text-red-500"><RotateCcw size={13} /><span className="hidden sm:inline">Clear</span></button></div></div>
          <div className="flex h-[42px] items-center justify-between border-b border-[#edf0ee] bg-[#fafbf9] px-5"><span className="flex max-w-[50%] items-center gap-1.5 truncate text-[10px] text-[#84928a]"><FileText size={11} className="shrink-0" /><span className="truncate">{filename}</span><span className="ml-0.5 size-1 rounded-full bg-[#aebbb0]" /></span><div className="relative flex items-center gap-1 text-[#819688]"><Sparkles size={11} /><select aria-label="Load an example" defaultValue="" onChange={event => { if (event.target.value) updateXml(EXAMPLES[event.target.value as keyof typeof EXAMPLES], "example.xml"); event.target.value = ""; }} className="max-w-[155px] appearance-none bg-transparent py-1 pl-1 pr-4 text-[10px]"><option value="" disabled>Try an example</option><option value="catalog">Book catalog (valid)</option><option value="broken">Mismatched tags (invalid)</option><option value="namespaces">With namespaces (valid)</option></select><ChevronDown size={10} className="pointer-events-none absolute right-0" /></div></div>
          <div onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); void loadFile(event.dataTransfer.files[0]); }} className="relative flex h-[380px] bg-white sm:h-[398px]">
            <div ref={gutter} aria-hidden="true" className="w-[49px] shrink-0 overflow-hidden border-r border-[#f0f2ef] bg-[#fcfdfb] py-5 text-right font-mono text-[11px] leading-6 text-[#b4bdb4]">{lines.map((_, index) => <div key={index} className={`pr-3.5 ${result && !result.valid && result.line === index + 1 ? "bg-red-100 font-semibold text-red-600" : ""}`}>{index + 1}</div>)}</div>
            <div className="relative min-w-0 flex-1"><div ref={highlight} aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden py-5 font-mono text-[12px] leading-6" style={{ tabSize: 2 }}><pre className="m-0 min-w-full w-max">{lines.map((line, index) => <div key={index} className={`min-h-6 px-5 ${result && !result.valid && result.line === index + 1 ? "bg-red-50 shadow-[inset_3px_0_0_#ef7777]" : ""}`}><SyntaxLine text={line} />{!line && " "}</div>)}<div className="h-6" /></pre></div><textarea ref={textarea} id="xml-input" aria-label="XML document editor" aria-describedby="editor-help" value={xml} onChange={event => updateXml(event.target.value)} onSelect={event => setCursorLine(xml.slice(0, event.currentTarget.selectionStart).split("\n").length)} onKeyDown={editorKeydown} onScroll={syncScroll} spellCheck={false} autoCapitalize="off" autoCorrect="off" wrap="off" maxLength={1_000_000} className="relative h-full w-full resize-none overflow-auto whitespace-pre bg-transparent px-5 py-5 font-mono text-[12px] leading-6 text-transparent caret-brand-600 focus-visible:ring-inset focus-visible:ring-brand-200" style={{ tabSize: 2 }} />{!xml && <div className="pointer-events-none absolute left-5 top-5 font-mono text-[12px] leading-6 text-[#a5b0a6]">Paste your XML here, or drop a file…</div>}</div>
          </div>
          <div id="editor-help" className="flex h-[34px] items-center justify-between border-t border-[#edf0ee] bg-[#fafbf9] px-5 text-[9px] text-[#98a399]"><span className="flex items-center gap-3"><span>{lines.length} {lines.length === 1 ? "line" : "lines"}</span><span className="size-0.5 rounded-full bg-[#b4bfb5]" /><span>{xml.length.toLocaleString()} characters</span></span><span className="flex items-center gap-3"><span>Ln {cursorLine}</span><span className="h-2.5 w-px bg-[#dce3db]" /><span>UTF-8</span></span></div>
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[#edf0ee] px-5 py-4"><div>{saveControl}</div><div className="flex items-center gap-3"><button onClick={download} disabled={!xml} aria-label="Download XML" title="Download XML" className="hidden rounded-md p-2 text-[#91a094] hover:bg-brand-50 hover:text-brand-600 sm:block"><ArrowDownToLine size={15} /></button><button onClick={() => void check()} disabled={busy} className={`${primaryButton} gap-2.5 px-4`}>{busy ? <LoaderCircle size={13} className="animate-spin" /> : <Play size={12} fill="currentColor" />}<span>{busy ? "Checking…" : "Check XML"}</span><span className="ml-1 hidden items-center gap-0.5 rounded border border-white/20 bg-white/10 px-1 py-0.5 text-[9px] font-normal text-white/70 sm:flex"><Command size={9} />↵</span></button></div></div>
        </section>
        <ResultPanel result={result} busy={busy} saved={saved} onJump={() => jumpToError()} />
      </div>

      <div className="mb-9 mt-4 flex flex-wrap items-center justify-between gap-3 px-0.5 text-[10px] text-[#96a297]"><span className="flex items-center gap-1.5"><ShieldCheck size={12} />Your XML stays yours. Anonymous checks are never stored.</span><span className="hidden items-center gap-1.5 sm:flex"><span className="size-1 rounded-full bg-[#a4b5a5]" />Small details. Better documents.</span></div>
      <HistorySection key={token || "guest"} token={token} onAuth={setAuthMode} refreshKey={refreshKey} onSessionExpired={sessionExpired} />

      <div className="mt-9 grid gap-5 px-1 sm:grid-cols-3">{[
        { icon: Code2, title: "Syntax, not schemas", text: "A focused check for well-formed XML." },
        { icon: CircleAlert, title: "Straight to the first error", text: "An exact line and column. No hunting." },
        { icon: LockKeyhole, title: "Private by design", text: "Your history belongs to you. Only you." },
      ].map(({ icon: Icon, title, text }) => <div key={title} className="flex items-start gap-3"><span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#edf2ec] text-[#86a28c]"><Icon size={14} strokeWidth={1.6} /></span><div><h3 className="text-[11px] font-medium text-[#748779]">{title}</h3><p className="mt-1 text-[10px] text-[#9aa69b]">{text}</p></div></div>)}</div>
    </main>

    <footer className="mx-auto flex max-w-[1256px] flex-wrap items-center justify-between gap-4 border-t border-[#e3e9e2] px-5 py-6 text-[10px] text-[#9aa59a] sm:mx-8 sm:px-0 lg:mx-auto"><div className="flex items-center gap-2"><Code2 size={15} className="text-[#8ca591]" /><span className="font-semibold text-[#7e9082]">XMLCheck.</span><span className="ml-2">Built for the details.</span></div><span className="flex items-center gap-1.5">Made for a well-formed web<span className="ml-1 text-brand-500">&lt;/&gt;</span></span></footer>
    {authMode && <AuthDialog mode={authMode} onModeChange={setAuthMode} onClose={() => setAuthMode(null)} onAuthenticated={(newToken, user) => { localStorage.setItem("xmlcheck-token", newToken); tokenRef.current = newToken; setToken(newToken); setUsername(user); setSave(true); setNotice(""); }} />}
  </div>;
}

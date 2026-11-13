import { useDeferredValue, useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  ArrowDown, ArrowRight, ArrowUpRight, Award, Check, ChevronLeft,
  ChevronRight, CircleHelp, Clock3, Crown, Eye, EyeOff, Gamepad2,
  Hash, LoaderCircle, LogOut, Medal, Plus, RefreshCw, Search,
  ShieldCheck, Sparkles, Target, Trophy, Users, X, Zap,
} from "lucide-react";
import { api, date, message, number, savedToken, saveToken } from "./api";
import type { AdminScores, Board, Period, PersonalScores, RankedPlayer, Submission, User } from "./api";

const button = "inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-forest disabled:cursor-not-allowed disabled:opacity-50";
const field = "w-full rounded-xl border border-line bg-white px-4 py-3 text-sm text-forest outline-none transition focus:border-forest focus:ring-2 focus:ring-forest/10 placeholder:text-muted/70";
const periods: { value: Period; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "week", label: "This week" },
  { value: "today", label: "Today" },
];

function Avatar({ name, className = "" }: { name: string; className?: string }) {
  const colors = ["bg-[#eef0ff] text-[#7770ae]", "bg-[#fce8d6] text-[#ad7043]", "bg-[#e6efdf] text-[#647d4e]", "bg-[#f7e7ed] text-[#a65f7c]", "bg-[#e0eff1] text-[#4e8087]"];
  const hash = Array.from(name).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return <span aria-hidden="true" className={`inline-flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${colors[hash % colors.length]} ${className}`}>{name.slice(0, 2).toUpperCase()}</span>;
}

function Notice({ children, success = false }: { children: ReactNode; success?: boolean }) {
  return <div role={success ? "status" : "alert"} className={`rounded-xl px-4 py-3 text-sm leading-relaxed ${success ? "bg-forest/7 text-forest" : "bg-red-50 text-red-700"}`}>{children}</div>;
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.querySelector<HTMLElement>("input, button")?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
      if (event.key === "Tab") {
        const elements = ref.current?.querySelectorAll<HTMLElement>("button:not([disabled]), input, a[href]");
        if (!elements?.length) return;
        const first = elements[0], last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", handleKey);
      previous?.focus();
    };
  }, []);
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-forest/35 p-4 backdrop-blur-sm" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="modal-title" className="relative max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-3xl bg-paper p-7 shadow-2xl sm:p-9">
      <button onClick={onClose} aria-label="Close dialog" className={`${button} absolute right-5 top-5 size-8 text-muted hover:bg-line`}><X size={18} /></button>
      <div className="mb-6 flex size-12 items-center justify-center rounded-2xl bg-lime text-forest"><Gamepad2 size={25} /></div>
      <h2 id="modal-title" className="mb-2 text-3xl font-bold tracking-tight">{title}</h2>
      {children}
    </div>
  </div>;
}

function AuthModal({ mode, onClose, onMode, onSignedIn }: {
  mode: "login" | "register";
  onClose: () => void;
  onMode: (mode: "login" | "register") => void;
  onSignedIn: (token: string, user: User) => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [registered, setRegistered] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const body = JSON.stringify({ username, password });
      if (mode === "register" && !registered) {
        await api("/auth/register", { method: "POST", body });
        setRegistered(true);
      }
      const { token } = await api<{ token: string }>("/auth/login", { method: "POST", body });
      const user = await api<User>("/auth/me", {}, token);
      onSignedIn(token, user);
    } catch (error) { setError(message(error)); }
    finally { setBusy(false); }
  }
  return <Modal title={mode === "login" ? "Welcome back." : "Your next high starts here."} onClose={onClose}>
    <p className="mb-7 text-sm leading-relaxed text-muted">{mode === "login" ? "Sign in, submit your best, and make your move." : "Join the community. Every great player starts somewhere."}</p>
    <form onSubmit={submit} className="space-y-4">
      <label className="block text-sm font-semibold">Username<input required maxLength={32} pattern="[A-Za-z0-9_.\-]+" autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} className={`${field} mt-2`} placeholder="Your player name" /></label>
      <label className="block text-sm font-semibold">Password<div className="relative mt-2"><input required maxLength={256} type={showPassword ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={e => setPassword(e.target.value)} className={`${field} pr-12`} placeholder="Your secret combo" /><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-3.5 text-muted">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
      {mode === "register" && <p className="text-xs leading-relaxed text-muted">Usernames can contain letters, numbers, dots, dashes and underscores.</p>}
      {registered && error && <Notice success>Your account was created. Retry to sign in.</Notice>}
      {error && <Notice>{error}</Notice>}
      <button disabled={busy} className={`${button} w-full bg-forest py-3.5 text-white hover:bg-forest/90`}>{busy ? <LoaderCircle size={18} className="animate-spin" /> : <ArrowRight size={18} />}{mode === "login" ? "Sign in" : registered ? "Sign in to your new account" : "Create account"}</button>
    </form>
    <p className="mt-6 text-center text-sm text-muted">{mode === "login" ? "New to the game?" : "Already a player?"} <button className="font-semibold text-forest underline underline-offset-4" onClick={() => { onMode(mode === "login" ? "register" : "login"); setError(""); setRegistered(false); }}>{mode === "login" ? "Create an account" : "Sign in"}</button></p>
  </Modal>;
}

function HeroArtwork() {
  return <div aria-hidden="true" className="relative hidden h-56 w-80 shrink-0 items-center justify-center md:flex">
    <div className="absolute size-52 rounded-full border border-forest/10" />
    <div className="absolute size-64 rounded-full border border-dashed border-forest/10" />
    <div className="absolute left-10 top-9 -rotate-12 rounded-lg border border-forest/15 bg-white px-3 py-1.5 font-mono text-xs font-bold shadow-sm">1UP <span className="text-[#80a543]">↑</span></div>
    <Sparkles className="absolute right-8 top-7 text-[#88a64e]" size={26} />
    <Plus className="absolute bottom-7 left-8 text-forest/40" size={20} />
    <div className="relative flex size-40 -rotate-8 items-center justify-center rounded-[2.5rem] bg-lime shadow-[8px_10px_0_0_#203c32] ring-1 ring-forest/10">
      <Trophy className="text-forest" size={85} strokeWidth={1.3} />
      <span className="absolute bottom-8 font-mono text-[11px] font-bold">GO FOR GREAT.</span>
    </div>
    <div className="absolute bottom-5 right-3 rotate-6 rounded-full border border-forest/10 bg-white px-4 py-2 text-xs font-bold shadow-sm"><span className="mr-2 inline-block size-2 rounded-full bg-[#91b84c]" />EVERY GAME COUNTS</div>
  </div>;
}

function Stat({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail: string }) {
  return <div className="flex items-center gap-4 rounded-2xl border border-line bg-white/70 px-5 py-5 sm:px-6">
    <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-paper text-forest/70">{icon}</div>
    <div className="min-w-0"><p className="text-xs font-medium text-muted">{label}</p><p className="mt-1 truncate text-2xl font-semibold tracking-tight tabular-nums">{value}</p><p className="mt-0.5 wrap-break-word text-[11px] text-muted">{detail}</p></div>
  </div>;
}

function Podium({ items, username }: { items: RankedPlayer[]; username?: string }) {
  if (!items.length) return <div className="mb-6 flex items-center justify-between gap-4 rounded-2xl bg-[#eff3e7] px-5 py-5 sm:px-6">
    <div><div className="mb-2 flex items-center gap-2 text-xs font-semibold text-[#6d8250]"><Sparkles size={14} /> THE NEXT GREAT SCORE COULD BE YOURS</div><p className="text-lg font-semibold tracking-tight">Every legend starts at zero.</p><p className="mt-1 text-xs text-muted">Play your best. Claim your place.</p></div>
    <div aria-hidden="true" className="flex h-20 shrink-0 items-end gap-1.5 text-center font-mono text-sm font-bold"><div className="flex h-10 w-9 items-center justify-center rounded-t-lg bg-forest/10 text-forest/50">2</div><div className="flex h-16 w-11 flex-col items-center justify-center gap-1 rounded-t-lg bg-lime"><Crown size={18} />1</div><div className="flex h-8 w-9 items-center justify-center rounded-t-lg bg-forest/10 text-forest/50">3</div></div>
  </div>;
  return <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
    {items.map((item, index) => <div key={item.player} className={`relative overflow-hidden rounded-2xl border p-4 ${index === 0 ? "border-[#d9e8bd] bg-[#eff5e4]" : "border-line bg-paper/60"}`}>
      <div className="mb-4 flex items-center justify-between"><span className={`flex size-7 items-center justify-center rounded-lg ${index === 0 ? "bg-lime text-forest" : index === 1 ? "bg-[#e6e8ec] text-[#7e858e]" : "bg-[#efe3d5] text-[#a57c52]"}`}><Medal size={16} /></span><span className="font-mono text-[11px] text-muted">0{item.rank} / {index === 0 ? "THE ONE TO BEAT" : index === 1 ? "RUNNER UP" : "ON THE PODIUM"}</span></div>
      <div className="flex items-center gap-2.5"><Avatar name={item.player} className="size-8" /><span className="truncate text-sm font-semibold">{item.player}</span>{item.player === username && <span className="text-[10px] text-muted">YOU</span>}</div>
      <p className="mt-3 truncate text-2xl font-bold tracking-tight tabular-nums">{number(item.score)}<span className="ml-1.5 text-[11px] font-normal text-muted">pts</span></p>
    </div>)}
  </div>;
}

function Leaderboard({ user, refresh, onRefresh, onJoin }: { user: User | null; refresh: number; onRefresh: () => void; onJoin: () => void }) {
  const [period, setPeriod] = useState<Period>("all");
  const [search, setSearch] = useState("");
  const query = useDeferredValue(search);
  const [limit, setLimit] = useState(25);
  const [board, setBoard] = useState<Board>({ items: [], total: 0 });
  const [podium, setPodium] = useState<RankedPlayer[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true); setError("");
    Promise.all([
      api<Board>(`/leaderboard?period=${period}&limit=${limit}&player=${encodeURIComponent(query)}`, { signal: controller.signal }),
      api<Board>(`/leaderboard?period=${period}&limit=3`, { signal: controller.signal }),
    ]).then(([board, top]) => { setBoard(board); setPodium(top.items); })
      .catch(error => { if (!controller.signal.aborted) setError(message(error)); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [period, query, limit, refresh]);
  return <section id="leaderboard" className="min-w-0 rounded-[1.4rem] border border-line bg-white p-5 sm:p-7">
    <div className="mb-6 flex items-center justify-between gap-3"><div><h2 className="text-xl font-bold tracking-tight">The leaderboard</h2><p className="mt-1 text-xs text-muted">One player. One best score. All the glory.</p></div><span className="flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[10px] font-medium text-muted"><span className="size-1.5 rounded-full bg-[#90b852]" /> LIVE RANKINGS</span></div>
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div className="flex rounded-xl bg-paper p-1" role="tablist" aria-label="Leaderboard period">{periods.map(tab => <button key={tab.value} role="tab" aria-selected={period === tab.value} onClick={() => setPeriod(tab.value)} className={`${button} rounded-lg px-4 py-2 text-xs sm:px-5 ${period === tab.value ? "bg-forest text-white shadow-sm" : "text-muted hover:text-forest"}`}>{tab.label}</button>)}</div>
      <button onClick={onRefresh} disabled={busy} className={`${button} gap-1.5 px-2 py-2 text-xs text-muted hover:text-forest`}><RefreshCw size={14} className={busy ? "animate-spin" : ""} />Refresh</button>
    </div>
    {!busy && !error && <Podium items={podium} username={user?.username} />}
    <div className="mb-4 flex items-center justify-between gap-3"><div className="relative min-w-0 flex-1"><Search size={16} className="absolute left-3.5 top-3 text-muted" /><input aria-label="Search players" placeholder="Find a player..." maxLength={32} value={search} onChange={e => setSearch(e.target.value)} className={`${field} bg-paper/50 py-2.5 pl-10 pr-9 text-xs`} />{search && <button aria-label="Clear search" className="absolute right-3 top-3 text-muted" onClick={() => setSearch("")}><X size={15} /></button>}</div><select aria-label="Leaderboard size" value={limit} onChange={e => setLimit(Number(e.target.value))} className="rounded-xl border border-line bg-white px-2 py-2.5 text-xs text-muted outline-forest"><option value={25}>Top 25</option><option value={50}>Top 50</option><option value={100}>Top 100</option><option value={1000}>Top 1,000</option></select></div>
    {error ? <div className="space-y-3 py-4"><Notice>{error}</Notice><button onClick={onRefresh} className={`${button} px-3 py-2 text-forest`}><RefreshCw size={14} />Try again</button></div> : <div className="overflow-x-auto">
      <table className="w-full text-left text-sm" aria-label="Player leaderboard" aria-busy={busy}>
        <thead><tr className="border-y border-line bg-paper/50 text-[10px] font-medium uppercase tracking-wider text-muted"><th className="w-16 py-3 pl-3 font-medium">Rank</th><th className="py-3 font-medium">Player</th><th className="py-3 text-right font-medium"><span className="inline-flex items-center gap-1">Score<ArrowDown size={11} /></span></th><th className="py-3 pl-5 pr-3 text-right font-medium">Achieved</th></tr></thead>
        <tbody>{busy ? Array.from({ length: 5 }, (_, index) => <tr key={index} className="border-b border-line/70"><td colSpan={4} className="py-4"><div className="h-7 animate-pulse rounded-lg bg-paper" /></td></tr>) : board.items.map(item => <tr key={item.player} className={`border-b border-line/70 transition-colors ${user?.username === item.player ? "bg-lime/25" : "hover:bg-paper/60"}`}>
          <td className="py-4 pl-3"><span className={`inline-flex size-7 items-center justify-center rounded-lg font-mono text-xs ${item.rank === 1 ? "bg-lime text-forest" : item.rank === 2 ? "bg-[#eceef1] text-[#79808a]" : item.rank === 3 ? "bg-[#f2e6da] text-[#a17c56]" : "text-muted"}`}>{item.rank <= 3 ? <Medal size={16} aria-label={`Rank ${item.rank}`} /> : String(item.rank).padStart(2, "0")}</span></td>
          <td className="py-4"><div className="flex items-center gap-2.5"><Avatar name={item.player} /><span className="max-w-32 truncate text-xs font-semibold sm:max-w-44">{item.player}</span>{user?.username === item.player && <span className="rounded bg-forest/8 px-1.5 py-0.5 text-[9px] font-bold text-forest">YOU</span>}</div></td>
          <td className="py-4 text-right font-mono text-xs font-semibold tabular-nums">{number(item.score)}</td><td className="whitespace-nowrap py-4 pl-5 pr-3 text-right text-[11px] text-muted"><time dateTime={item.achieved_at} title={date(item.achieved_at, true)}>{date(item.achieved_at)}</time></td>
        </tr>)}</tbody>
      </table>
      {!busy && !board.items.length && <div className="flex flex-col items-center px-3 py-12 text-center"><div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-paper text-forest/60">{search ? <Search size={23} /> : <Trophy size={23} />}</div><h3 className="text-base font-semibold">{search ? "No players found" : period === "all" ? "Be the first on the board." : "A fresh start. A new high."}</h3><p className="mt-2 max-w-xs text-xs leading-relaxed text-muted">{search ? `No ranked players match “${search}”. Try another name.` : "No scores here yet. Submit a score and set the standard."}</p>{search ? <button onClick={() => setSearch("")} className={`${button} mt-5 text-xs underline underline-offset-4`}>Clear search</button> : <button onClick={user ? () => document.getElementById("score-input")?.focus() : onJoin} className={`${button} mt-5 bg-forest px-4 py-2.5 text-xs text-white`}>{user ? "Submit your first score" : "Join the leaderboard"}<ArrowUpRight size={14} /></button>}</div>}
    </div>}
    <div className="mt-5 flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted"><span>{busy ? "Updating rankings..." : `Showing ${number(board.items.length)} of ${number(board.total)} ${search ? "matching " : ""}players`}</span><span className="flex items-center gap-1.5"><ShieldCheck size={12} />Fair play. Visible scores only.</span></div>
  </section>;
}

function PlayerPanel({ user, token, refresh, onRefresh, onJoin }: { user: User | null; token: string | null; refresh: number; onRefresh: () => void; onJoin: () => void }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Submission | null>(null);
  const [error, setError] = useState("");
  const [personal, setPersonal] = useState<PersonalScores | null>(null);
  const [historyError, setHistoryError] = useState("");
  const [historyBusy, setHistoryBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);
  useEffect(() => {
    setResult(null); setError(""); setValue(""); setPersonal(null); setShowAll(false);
  }, [token]);
  useEffect(() => {
    if (!token || !user) { setPersonal(null); return; }
    const controller = new AbortController();
    setHistoryBusy(true); setHistoryError("");
    api<PersonalScores>("/scores", { signal: controller.signal }, token)
      .then(setPersonal).catch(error => { if (!controller.signal.aborted) setHistoryError(message(error)); })
      .finally(() => { if (!controller.signal.aborted) setHistoryBusy(false); });
    return () => controller.abort();
  }, [token, user, refresh]);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(""); setResult(null);
    const score = Number(value);
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(score) || score < 0) { setError("Enter a valid, non-negative whole number."); return; }
    setBusy(true);
    try {
      const result = await api<Submission>("/scores", { method: "POST", body: JSON.stringify({ score }) }, token);
      setResult(result); setValue(""); onRefresh();
    } catch (error) { setError(message(error)); }
    finally { setBusy(false); }
  }
  return <aside className="space-y-5">
    <section className="relative overflow-hidden rounded-[1.4rem] border border-[#dce7cd] bg-[#edf3e5] p-6">
      <div className="mb-5 flex items-center justify-between"><span className="flex size-10 items-center justify-center rounded-xl bg-white/70"><Zap size={20} strokeWidth={1.7} /></span><span className="text-[10px] font-semibold tracking-[0.12em] text-[#7b8b69]">YOUR NEXT MOVE</span></div>
      <h2 className="text-xl font-bold tracking-tight">Got a new high?</h2><p className="mb-6 mt-2 text-xs leading-relaxed text-muted">Big win or a little progress.<br />Put your score on the board.</p>
      {user ? <form className="space-y-3" onSubmit={submit}><label htmlFor="score-input" className="block text-xs font-semibold">Your score</label><div className="relative"><input id="score-input" required type="number" min="0" max="9007199254740991" step="1" inputMode="numeric" value={value} onChange={e => setValue(e.target.value)} className={`${field} border-[#dce7cd] py-3.5 pr-12 font-mono text-xl font-semibold`} placeholder="0" /><span className="absolute right-4 top-5 text-xs text-muted">pts</span></div>{error && <Notice>{error}</Notice>}<button disabled={busy} className={`${button} w-full bg-forest py-3.5 text-white hover:bg-forest/90`}>{busy ? <LoaderCircle size={17} className="animate-spin" /> : <Plus size={17} />}Submit score</button>{result && <div role="status" className="rounded-xl border border-forest/10 bg-white/70 p-4"><div className="flex items-center gap-2 text-xs font-semibold"><Check size={15} />{number(result.score)} points submitted</div><p className="mt-2 text-sm">Your all-time rank: <strong>#{number(result.rank)}</strong></p>{result.personal_best && <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-[#648735]"><Sparkles size={15} />New personal best!</p>}</div>}<p className="pt-1 text-center text-[10px] text-muted">Make it count. Keep it honest.</p></form> : <><div className="mb-4 rounded-xl border border-[#dce7cd] bg-white/60 px-4 py-4"><div className="flex items-center justify-between"><span className="font-mono text-2xl font-semibold text-forest/25">000,000</span><span className="text-xs text-muted">pts</span></div></div><button onClick={onJoin} className={`${button} w-full bg-forest py-3.5 text-white hover:bg-forest/90`}>Sign in to submit<ArrowRight size={16} /></button><p className="mt-3 text-center text-[10px] text-muted">Your personal best is waiting.</p></>}
    </section>
    <section className="rounded-[1.4rem] border border-line bg-white p-6">
      <div className="mb-5 flex items-center justify-between"><h2 className="text-base font-bold tracking-tight">Your scorecard</h2><Target size={18} className="text-muted" /></div>
      <div className="mb-5 rounded-xl bg-paper px-4 py-4"><p className="mb-2 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted"><Award size={13} />Personal best</p><p className="truncate font-mono text-3xl font-semibold tracking-tight">{user && personal?.best_score != null ? number(personal.best_score) : "—"}<span className="ml-2 font-sans text-xs font-normal text-muted">pts</span></p><p className="mt-2 text-[10px] text-muted">{user ? "Your best visible score, all time." : "Sign in to track your progress."}</p></div>
      <div className="mb-4 flex items-center justify-between"><h3 className="text-xs font-semibold">Recent submissions</h3><Clock3 size={13} className="text-muted" /></div>
      {historyError ? <div className="space-y-2"><Notice>{historyError}</Notice><button onClick={onRefresh} className={`${button} py-2 text-xs`}>Retry</button></div> : historyBusy ? <div className="space-y-3">{[1, 2, 3].map(n => <div key={n} className="h-9 animate-pulse rounded-lg bg-paper" />)}</div> : user && personal?.items.length ? <><ul className="divide-y divide-line">{(showAll ? personal.items : personal.items.slice(0, 5)).map(score => <li key={score.id} className="flex items-center justify-between gap-3 py-3 first:pt-0"><div><p className={`font-mono text-sm font-semibold tabular-nums ${score.is_hidden ? "text-muted line-through" : ""}`}>{number(score.score)}<span className="ml-1.5 font-sans text-[10px] font-normal text-muted">pts</span></p><time dateTime={score.achieved_at} className="mt-1 block text-[10px] text-muted">{date(score.achieved_at, true)}</time></div>{score.is_hidden ? <span title="Hidden by the admin; excluded from rankings" className="rounded-full bg-[#f3ece5] px-2 py-1 text-[9px] text-[#997958]">Hidden</span> : score.score === personal.best_score ? <span title="Personal best" className="text-[#8caa51]"><Sparkles size={15} /></span> : <Check size={13} className="text-muted/50" />}</li>)}</ul>{personal.items.length > 5 && <button onClick={() => setShowAll(!showAll)} className={`${button} mt-3 w-full py-2 text-xs text-muted`}>{showAll ? "Show recent only" : `View all ${number(personal.items.length)} submissions`}<ChevronRight size={13} /></button>}</> : <div className="rounded-xl border border-dashed border-line px-4 py-6 text-center"><Hash size={19} className="mx-auto mb-2 text-muted/50" /><p className="text-xs text-muted">{user ? "Your story starts with one score." : "A little friendly competition?"}</p><p className="mt-1 text-[10px] text-muted/70">{user ? "Submit your first score above." : "Sign in to see your recent games."}</p></div>}
    </section>
    <div className="flex gap-3 px-2 py-1"><ShieldCheck size={19} className="mt-0.5 shrink-0 text-[#819565]" /><p className="text-[11px] leading-relaxed text-muted"><strong className="font-semibold text-forest/80">Good games. Fair play.</strong><br />Scores are reviewed to keep the competition honest. Hidden scores don't affect rankings.</p></div>
  </aside>;
}

function AdminPanel({ token, refresh, onRefresh }: { token: string; refresh: number; onRefresh: () => void }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [data, setData] = useState<AdminScores | null>(null);
  const [busy, setBusy] = useState(true);
  const [toggling, setToggling] = useState<number | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController(); setBusy(true); setError("");
    api<AdminScores>(`/admin/scores?page=${page}&page_size=${pageSize}`, { signal: controller.signal }, token)
      .then(setData).catch(error => { if (!controller.signal.aborted) setError(message(error)); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [page, pageSize, token, refresh]);
  async function toggle(id: number) {
    setToggling(id); setError("");
    try { await api(`/admin/scores/${id}/toggle`, { method: "POST" }, token); onRefresh(); }
    catch (error) { setError(message(error)); }
    finally { setToggling(null); }
  }
  const pages = Math.max(1, Math.ceil((data?.total || 0) / pageSize));
  return <section className="mt-7 rounded-[1.4rem] border border-line bg-white p-5 sm:p-7">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4"><div><div className="flex items-center gap-2"><ShieldCheck size={21} /><h2 className="text-xl font-bold tracking-tight">Score moderation</h2><span className="rounded-md bg-lime px-2 py-1 text-[9px] font-bold">ADMIN</span></div><p className="mt-2 text-xs text-muted">Keep the playing field level. Hide implausible scores or restore them.</p></div><button disabled={busy} onClick={onRefresh} className={`${button} border border-line px-3 py-2 text-xs`}><RefreshCw size={14} className={busy ? "animate-spin" : ""} />Refresh</button></div>
    {error && <div className="mb-4"><Notice>{error}</Notice></div>}
    <div className="overflow-x-auto"><table className="w-full text-left text-xs" aria-label="All scores for moderation" aria-busy={busy}><thead><tr className="border-y border-line bg-paper/50 text-[10px] uppercase tracking-wider text-muted"><th className="p-3 font-medium">ID</th><th className="p-3 font-medium">Player</th><th className="p-3 text-right font-medium">Score</th><th className="p-3 font-medium">Submitted</th><th className="p-3 font-medium">Status</th><th className="p-3 text-right font-medium">Action</th></tr></thead><tbody>{data?.items.map(score => <tr key={score.id} className={`border-b border-line ${score.is_hidden ? "bg-paper/70 text-muted" : ""}`}><td className="p-3 font-mono text-muted">#{score.id}</td><td className="p-3"><div className="flex items-center gap-2"><Avatar name={score.player} /><span className="font-semibold">{score.player}</span></div></td><td className={`p-3 text-right font-mono font-semibold ${score.is_hidden ? "line-through" : ""}`}>{number(score.score)}</td><td className="whitespace-nowrap p-3 text-muted">{date(score.achieved_at, true)}</td><td className="p-3"><span className={`rounded-full px-2.5 py-1 text-[10px] ${score.is_hidden ? "bg-[#f3e9df] text-[#99734d]" : "bg-[#edf3e5] text-[#6a8445]"}`}>{score.is_hidden ? "Hidden" : "Visible"}</span></td><td className="p-3 text-right"><button disabled={toggling !== null || busy} onClick={() => toggle(score.id)} aria-label={`${score.is_hidden ? "Show" : "Hide"} score ${score.id} by ${score.player}`} className={`${button} border border-line px-3 py-2 text-xs hover:bg-paper`}>{toggling === score.id ? <LoaderCircle size={13} className="animate-spin" /> : score.is_hidden ? <Eye size={13} /> : <EyeOff size={13} />}{score.is_hidden ? "Show" : "Hide"}</button></td></tr>)}</tbody></table>{busy && <div className="py-8 text-center text-xs text-muted">Loading scores...</div>}{!busy && !data?.items.length && <div className="py-10 text-center text-sm text-muted">No submissions to review.</div>}</div>
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-xs text-muted"><span>{number(data?.total || 0)} total submissions</span><div className="flex items-center gap-3"><select aria-label="Scores per page" value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }} className="rounded-lg border border-line bg-white px-2 py-2"><option value={20}>20 / page</option><option value={50}>50 / page</option><option value={100}>100 / page</option></select><button aria-label="Previous page" disabled={page <= 1 || busy} onClick={() => setPage(page - 1)} className={`${button} size-8 border border-line`}><ChevronLeft size={15} /></button><span>{page} / {pages}</span><button aria-label="Next page" disabled={page >= pages || busy} onClick={() => setPage(page + 1)} className={`${button} size-8 border border-line`}><ChevronRight size={15} /></button></div></div>
  </section>;
}

export default function App() {
  const [token, setToken] = useState(savedToken);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(!token);
  const [authMode, setAuthMode] = useState<"login" | "register" | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [summary, setSummary] = useState<Board | null>(null);
  const [sessionNotice, setSessionNotice] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  useEffect(() => {
    const expired = () => { saveToken(null); setToken(null); setUser(null); setAuthReady(true); setSessionNotice("Your session expired. Sign in again to keep playing."); };
    window.addEventListener("session-expired", expired);
    return () => window.removeEventListener("session-expired", expired);
  }, []);
  useEffect(() => {
    if (!token) { setAuthReady(true); return; }
    const controller = new AbortController();
    api<User>("/auth/me", { signal: controller.signal }, token).then(setUser)
      .catch(error => { if (!controller.signal.aborted) setSessionNotice(message(error)); })
      .finally(() => { if (!controller.signal.aborted) setAuthReady(true); });
    return () => controller.abort();
  }, [token]);
  useEffect(() => {
    const controller = new AbortController();
    api<Board>("/leaderboard?limit=1", { signal: controller.signal }).then(setSummary).catch(() => {});
    return () => controller.abort();
  }, [refresh]);
  function signedIn(token: string, user: User) {
    saveToken(token); setToken(token); setUser(user); setAuthReady(true); setAuthMode(null); setSessionNotice(""); setRefresh(value => value + 1);
  }
  async function signOut() {
    setSigningOut(true);
    try {
      await api("/auth/logout", { method: "POST" }, token);
      saveToken(null); setToken(null); setUser(null); setSessionNotice("");
    } catch (error) { setSessionNotice(message(error)); }
    finally { setSigningOut(false); }
  }
  const doRefresh = () => setRefresh(value => value + 1);
  return <div className="min-h-screen bg-paper font-sans text-forest antialiased selection:bg-lime">
    <header className="border-b border-line bg-white/60"><div className="mx-auto flex h-20 max-w-[1200px] items-center justify-between gap-2 px-5 sm:gap-4 sm:px-8">
      <a href="/" aria-label="Highscore home" className="flex shrink-0 items-center gap-1.5 sm:gap-2.5"><span className="flex size-8 items-center justify-center rounded-xl bg-forest text-lime sm:size-9"><ArrowUpRight size={26} strokeWidth={2.3} /></span><span className="text-lg font-extrabold tracking-[-0.07em] sm:text-xl">highscore<span className="text-[#8faf55]">.</span></span></a>
      <nav aria-label="Main navigation" className="hidden h-full items-center gap-8 md:flex"><a href="#leaderboard" className="flex h-full items-center gap-2 border-b-2 border-forest px-1 text-xs font-semibold"><Trophy size={15} />Leaderboard</a><button onClick={() => setShowHelp(true)} className="flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-forest">How it works<ArrowUpRight size={12} /></button></nav>
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">{!authReady ? <LoaderCircle size={20} className="animate-spin text-muted" /> : user ? <><div className="flex min-w-0 items-center gap-2"><Avatar name={user.username} className="hidden size-8 sm:inline-flex" /><span className="max-w-20 truncate text-xs font-semibold sm:max-w-40" title={user.username}>{user.username}</span>{user.is_admin && <ShieldCheck size={14} className="shrink-0 text-muted" aria-label="Admin account" />}</div><button onClick={signOut} aria-label="Sign out" disabled={signingOut} className={`${button} shrink-0 border border-line bg-white px-3 py-2.5 text-xs hover:bg-paper`}><LogOut size={14} /><span className="hidden sm:inline">Sign out</span></button></> : <><button onClick={() => setAuthMode("login")} className={`${button} px-2 py-2.5 text-xs hover:text-muted`}>Sign in</button><button onClick={() => setAuthMode("register")} aria-label="Join the game" className={`${button} bg-forest px-4 py-2.5 text-xs text-white hover:bg-forest/90`}><span className="sm:hidden">Join</span><span className="hidden sm:inline">Join the game</span><ArrowUpRight size={14} /></button></>}</div>
    </div></header>
    <main className="mx-auto max-w-[1200px] px-5 pb-12 sm:px-8">
      {sessionNotice && <div className="mt-5 flex items-center gap-3 rounded-xl border border-line bg-white p-4 text-xs text-muted" role="status"><span className="flex-1">{sessionNotice}</span><button onClick={() => setAuthMode("login")} className="font-semibold text-forest underline">Sign in</button><button aria-label="Dismiss notification" onClick={() => setSessionNotice("")}><X size={15} /></button></div>}
      <section className="flex items-center justify-between gap-8 py-10 sm:py-12"><div><div className="mb-5 flex items-center gap-2 text-[10px] font-semibold tracking-[0.16em] text-muted"><span className="flex size-5 items-center justify-center rounded-md bg-lime"><Gamepad2 size={13} className="text-forest" /></span>A LITTLE COMPETITION. A LOT OF FUN.</div><h1 className="text-[44px] font-bold leading-[1.08] tracking-[-0.055em] sm:text-[58px]">Good games.<br />Great scores<span className="text-[#91ae61]">.</span></h1><p className="mt-5 max-w-md text-sm leading-6 text-muted">Chase your personal best. Climb the ranks.<br className="hidden sm:block" /> See how you stack up with the community.</p></div><HeroArtwork /></section>
      <div className="mb-8 grid grid-cols-1 gap-3 min-[480px]:grid-cols-3 sm:gap-5"><Stat icon={<Users size={21} strokeWidth={1.7} />} label="Players on the board" value={summary ? number(summary.total) : "—"} detail="A community of high achievers" /><Stat icon={<Crown size={22} strokeWidth={1.7} />} label="Score to beat" value={summary?.items.length ? number(summary.items[0].score) : "—"} detail={summary?.items.length ? `Set by ${summary.items[0].player}` : "The top spot is up for grabs"} /><Stat icon={<Gamepad2 size={22} strokeWidth={1.7} />} label="Your next challenge" value={user ? "Make your move" : "Ready, player?"} detail={user ? `You're in, ${user.username}. Let's play.` : "Your next great game starts here"} /></div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_310px]"><Leaderboard user={user} refresh={refresh} onRefresh={doRefresh} onJoin={() => setAuthMode("register")} /><PlayerPanel user={user} token={token} refresh={refresh} onRefresh={doRefresh} onJoin={() => setAuthMode("login")} /></div>
      {user?.is_admin && token && <AdminPanel token={token} refresh={refresh} onRefresh={doRefresh} />}
      <section className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line px-6 py-5"><div className="flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-xl bg-white"><Trophy size={18} strokeWidth={1.5} /></span><div><p className="text-xs font-semibold">It's not just about the top spot.</p><p className="mt-1 text-[11px] text-muted">It's about beating your last best. You've got this.</p></div></div><button onClick={() => setShowHelp(true)} className={`${button} text-xs text-muted hover:text-forest`}>The rules of the game<ArrowUpRight size={14} /></button></section>
    </main>
    <footer className="border-t border-line"><div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-3 px-5 py-6 text-[10px] text-muted sm:px-8"><span className="font-semibold tracking-tight">highscore. <span className="ml-2 font-normal">Made for the love of the game.</span></span><div className="flex items-center gap-5"><span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-[#94af68]" />All rankings in UTC</span><button onClick={() => setShowHelp(true)} aria-label="How Highscore works" className="hover:text-forest"><CircleHelp size={15} /></button></div></div></footer>
    {authMode && <AuthModal mode={authMode} onMode={setAuthMode} onClose={() => setAuthMode(null)} onSignedIn={signedIn} />}
    {showHelp && <Modal title="Play. Post. Climb." onClose={() => setShowHelp(false)}><p className="mb-6 text-sm leading-relaxed text-muted">Friendly competition, simple rules.</p><ol className="space-y-5">{[{ title: "Make it yours", text: "Create an account and submit a non-negative whole-number score. Every submission belongs to you and is dated by the server." }, { title: "Your best takes the stage", text: "Each player appears once, ranked by their best visible score. Ties go to the score achieved first. Search keeps the original ranks." }, { title: "Pick your playing field", text: "All time means every game. This week starts Monday at 00:00 UTC. Today starts at 00:00 UTC." }, { title: "Keep the game fair", text: "The admin can hide implausible scores. Hidden submissions stay in your history but don't count toward your best or your rank." }].map((rule, index) => <li key={rule.title} className="flex gap-3"><span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-lime font-mono text-xs font-semibold">{index + 1}</span><div><h3 className="text-sm font-semibold">{rule.title}</h3><p className="mt-1 text-xs leading-relaxed text-muted">{rule.text}</p></div></li>)}</ol><button onClick={() => setShowHelp(false)} className={`${button} mt-7 w-full bg-forest py-3 text-white`}>Got it. Game on.<ArrowRight size={16} /></button></Modal>}
    </div>;
}

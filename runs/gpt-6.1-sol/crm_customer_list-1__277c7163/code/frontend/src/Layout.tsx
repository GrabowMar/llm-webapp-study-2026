import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { ArrowUpRight, BookOpen, CheckCircle2, ChevronRight, CircleHelp, Leaf, LogOut, Menu, ShieldCheck, Users, X } from "lucide-react";
import { useAuth } from "./App";
import { initials } from "./api";
import { Logo, Modal } from "./ui";

export type LayoutContext = { notify: (text: string) => void };

export function Layout() {
  const { user, signOut } = useAuth();
  const [mobile, setMobile] = useState(false);
  const [guide, setGuide] = useState(false);
  const [toast, setToast] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const location = useLocation();
  useEffect(() => { setMobile(false); }, [location.pathname]);
  useEffect(() => () => clearTimeout(timer.current), []);
  function notify(text: string) { setToast(text); clearTimeout(timer.current); timer.current = setTimeout(() => setToast(""), 5000); }
  const detail = location.pathname !== "/customers";
  return <div className="min-h-dvh bg-[#f8f9fb] text-slate-800">
    {mobile && <button aria-label="Close menu" onClick={() => setMobile(false)} className="fixed inset-0 z-30 bg-slate-950/25 lg:hidden" />}
    <aside className={`fixed inset-y-0 left-0 z-40 flex w-[244px] flex-col border-r border-slate-200/75 bg-white transition-transform lg:translate-x-0 ${mobile ? "translate-x-0" : "-translate-x-full"}`}>
      <Link to="/customers" className="flex h-[84px] items-center px-6"><Logo /></Link>
      <div className="mx-5 flex items-center gap-3 rounded-lg border border-slate-200/80 px-3 py-3"><span className="flex size-8 items-center justify-center rounded-md bg-[#f1f2ee] text-brand-700"><Leaf size={17} /></span><div><p className="text-[13px] font-semibold">Team workspace</p><p className="mt-0.5 text-[11px] text-slate-400">Shared customer directory</p></div><ShieldCheck size={14} className="ml-auto text-slate-400" /></div>
      <nav aria-label="Main navigation" className="mt-8 px-4"><p className="mb-3 px-3 text-[10px] font-semibold tracking-[1.5px] text-slate-400">WORKSPACE</p><NavLink to="/customers" className="flex items-center gap-3 rounded-lg bg-brand-50 px-3 py-3 text-sm font-medium text-brand-700"><Users size={18} strokeWidth={1.7} />Customers<span className="ml-auto size-1.5 rounded-full bg-brand-500" /></NavLink><button onClick={() => setGuide(true)} className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"><BookOpen size={18} strokeWidth={1.7} />Workspace guide<ArrowUpRight size={14} className="ml-auto text-slate-400" /></button></nav>
      <div className="mx-5 mb-6 mt-auto rounded-xl border border-brand-100/70 bg-[#f7faf7] p-4"><span className="flex size-8 items-center justify-center rounded-lg bg-brand-100/60 text-brand-600"><MessageIllustration /></span><h3 className="mt-3 text-xs font-semibold text-brand-900">Small details. Stronger connections.</h3><p className="mt-2 text-xs leading-5 text-slate-500">Log a conversation today. Your teammates will thank you tomorrow.</p></div>
      <div className="border-t border-slate-100 p-4"><div className="flex items-center gap-3 rounded-lg px-2 py-1"><span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#ecece6] text-xs font-semibold text-slate-600">{initials(user!.username)}</span><div className="min-w-0"><p className="truncate text-sm font-medium">{user!.username}</p><p className="mt-0.5 text-[11px] text-slate-400">Team member</p></div><button title="Sign out" aria-label="Sign out" onClick={() => { void signOut().catch(() => {}); }} className="ml-auto rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><LogOut size={16} /></button></div></div>
    </aside>
    <div className="lg:ml-[244px]">
      <header className="flex h-[72px] items-center justify-between border-b border-slate-200/75 bg-white px-5 sm:px-9"><div className="flex items-center gap-3"><button onClick={() => setMobile(!mobile)} aria-label="Open menu" className="rounded-lg p-2 text-slate-500 lg:hidden"><Menu size={20} /></button><span className="hidden text-[13px] text-slate-400 sm:inline">Workspace</span><ChevronRight size={14} className="hidden text-slate-300 sm:block" /><Link to="/customers" className={`text-[13px] ${detail ? "text-slate-500 hover:text-brand-700" : "font-medium text-slate-700"}`}>Customers</Link>{detail && <><ChevronRight size={14} className="text-slate-300" /><span className="text-[13px] font-medium">Customer profile</span></>}</div><div className="flex items-center gap-5"><span className="hidden items-center gap-1.5 text-xs text-slate-400 md:inline-flex"><span className="size-1.5 rounded-full bg-brand-500" /> Your team, in sync</span><button onClick={() => setGuide(true)} title="Workspace guide" aria-label="Workspace guide" className="rounded-full p-2 text-slate-400 hover:bg-slate-50 hover:text-brand-700"><CircleHelp size={18} /></button><span className="flex size-8 items-center justify-center rounded-full border border-brand-100 bg-brand-50 text-[11px] font-semibold text-brand-700">{initials(user!.username)}</span></div></header>
      <main className="mx-auto max-w-[1500px] px-5 py-8 sm:px-9 lg:py-10"><Outlet context={{ notify } satisfies LayoutContext} /></main>
      <footer className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-2 px-5 pb-7 pt-4 text-[11px] text-slate-400 sm:px-9"><span>Made for people, not spreadsheets.</span><span className="flex items-center gap-1.5"><ShieldCheck size={12} /> Private to your team</span></footer>
    </div>
    {toast && <div role="status" className="fixed bottom-6 right-5 z-50 flex max-w-[calc(100%-2.5rem)] items-center gap-3 rounded-xl border border-brand-100 bg-white px-5 py-4 text-sm shadow-lg"><CheckCircle2 size={18} className="text-brand-600" />{toast}<button onClick={() => setToast("")} aria-label="Dismiss notification" className="ml-3 text-slate-400"><X size={16} /></button></div>}
    {guide && <Modal title="A little guide to Commonplace" description="Good relationships are a team effort." onClose={() => setGuide(false)}><div className="space-y-5 p-6 text-sm leading-6 text-slate-500"><div><h3 className="font-semibold text-slate-800">One directory, shared by everyone</h3><p>Every signed-in member can view, add, edit, and delete customers. Search by name, contact details, company, or notes.</p></div><div><h3 className="font-semibold text-slate-800">Keep the conversation going</h3><p>Open a customer to log a call, email, or meeting. Add a summary and the time it happened; your name is attached automatically.</p></div><div><h3 className="font-semibold text-slate-800">A few thoughtful details</h3><p>Customer emails are unique. Last contacted reflects the latest interaction, even if an older conversation is logged later. Deleting a customer also removes their interaction history.</p></div><div className="flex items-center gap-2 border-t border-slate-100 pt-4 text-xs"><ShieldCheck size={16} className="text-brand-600" /> Your directory is only accessible to signed-in team members.</div></div></Modal>}
  </div>;
}

function MessageIllustration() { return <BookOpen size={17} strokeWidth={1.6} />; }

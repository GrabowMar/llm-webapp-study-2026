import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, CalendarDays, Check, CheckCircle2, ChevronLeft, ChevronRight, CircleHelp, Clock3, Globe2, Leaf, Loader2, LogOut, Menu, Plus, Search, Users, X } from "lucide-react";
import type { CalendarEvent, View } from "./lib";
import { ApiError, addDays, api, changeMonth, dayStart, daysForView, eventInitials, formatDate, monthStart, periodTitle, shortTime, weekStart } from "./lib";
import { DayEventList, MiniCalendar, MonthCalendar, TimeCalendar } from "./Calendar";
import { AuthDialog, EventDetailDialog, EventFormDialog, HelpDialog } from "./Dialogs";
import { BotanicalIllustration, GatherMark, IconButton, primaryButton } from "./ui";

type Dialog =
  | { type: "auth"; mode: "login" | "register" }
  | { type: "create"; date: Date }
  | { type: "edit"; event: CalendarEvent }
  | { type: "detail"; event: CalendarEvent }
  | { type: "help" }
  | null;

function savedToken() {
  try { return localStorage.getItem("gather-token") || ""; } catch { return ""; }
}

export default function App() {
  const [today, setToday] = useState(() => dayStart(new Date()));
  const [date, setDate] = useState(today);
  const [view, setView] = useState<View>("month");
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [token, setToken] = useState(savedToken);
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [showCalendar, setShowCalendar] = useState(true);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [toast, setToast] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const signedIn = !!token && !!username;

  const loadEvents = useCallback(async (signal?: AbortSignal) => {
    try {
      const result = await api<{ items: CalendarEvent[]; total: number }>("/events", { signal });
      setEvents(result.items);
      setLoadError("");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setLoadError(err instanceof Error ? err.message : "Unable to load events.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadEvents(controller.signal);
    const refresh = () => {
      setToday(dayStart(new Date()));
      void loadEvents(controller.signal);
    };
    const interval = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    return () => {
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, [loadEvents]);

  const clearAccount = useCallback(() => {
    setToken("");
    setUsername("");
    try { localStorage.removeItem("gather-token"); } catch {}
  }, []);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    api<{ username: string }>("/auth/me", { signal: controller.signal }, token).then(data => setUsername(data.username)).catch(err => {
      if (err instanceof ApiError && err.status === 401) clearAccount();
    });
    return () => controller.abort();
  }, [token, clearAccount]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 4000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const navigate = useCallback((direction: number) => {
    setDate(previous => view === "month" ? changeMonth(previous, direction) : addDays(previous, direction * (view === "week" ? 7 : 1)));
  }, [view]);

  const createEvent = useCallback((eventDate: Date) => {
    setDialog(signedIn ? { type: "create", date: eventDate } : { type: "auth", mode: "login" });
  }, [signedIn]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (dialog || event.ctrlKey || event.metaKey || event.altKey || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable) return;
      const key = event.key.toLowerCase();
      if (["arrowleft", "arrowright", "t", "m", "w", "d", "n", "/"].includes(key)) event.preventDefault();
      if (key === "arrowleft") navigate(-1);
      if (key === "arrowright") navigate(1);
      if (key === "t") setDate(dayStart(new Date()));
      if (key === "m") setView("month");
      if (key === "w") setView("week");
      if (key === "d") setView("day");
      if (key === "n") createEvent(date);
      if (key === "/") searchRef.current?.focus();
    };
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  }, [dialog, navigate, createEvent, date]);

  const filteredEvents = useMemo(() => {
    if (!showCalendar) return [];
    const query = search.trim().toLowerCase();
    if (!query) return events;
    return events.filter(event => [event.title, event.description, event.location, event.created_by].some(value => value?.toLowerCase().includes(query)));
  }, [events, search, showCalendar]);
  const days = daysForView(date, view);
  const periodStart = view === "month" ? monthStart(date) : view === "week" ? weekStart(date) : dayStart(date);
  const periodEnd = view === "month" ? new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)) : addDays(periodStart, view === "week" ? 7 : 1);
  const periodEvents = filteredEvents.filter(event => new Date(event.start_time) < periodEnd && new Date(event.end_time) > periodStart);
  const upcomingEvents = filteredEvents.filter(event => new Date(event.end_time).getTime() > Date.now()).slice(0, 4);
  const monthEventCount = events.filter(event => new Date(event.start_time) < new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1)) && new Date(event.end_time) >= monthStart(today)).length;
  const selectDate = (selected: Date) => { setDate(selected); setMobileMenu(false); };
  const calendarProps = { date, days, events: filteredEvents, today, signedIn, onSelect: selectDate, onCreate: createEvent, onEvent: (event: CalendarEvent) => setDialog({ type: "detail", event }) };

  const authenticate = (newToken: string, name: string) => {
    try { localStorage.setItem("gather-token", newToken); } catch {}
    setToken(newToken);
    setUsername(name);
    setDialog(null);
    setToast(`You’re in. Welcome, ${name}!`);
  };

  async function signOut() {
    try { await api("/auth/logout", { method: "POST" }, token); } catch {}
    clearAccount();
    setDialog(null);
    setToast("You’ve signed out. See you soon.");
  }

  function saveEvent(saved: CalendarEvent, edited: boolean) {
    setEvents(previous => [...previous.filter(event => event.id !== saved.id), saved].sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()));
    setDate(dayStart(new Date(saved.start_time)));
    setShowCalendar(true);
    setSearch("");
    setDialog(null);
    setToast(edited ? "Change of plans, saved." : "Something good is on the calendar.");
    void loadEvents();
  }

  const sidebar = <>
    <div className="flex h-[77px] shrink-0 items-center gap-2.5 border-b border-line px-7">
      <GatherMark className="size-9 text-forest" /><span className="text-[25px] font-bold tracking-[-1.2px]">gather<span className="text-[#93a482]">.</span></span>
      <button onClick={() => setMobileMenu(false)} className="ml-auto rounded-lg p-1 text-muted lg:hidden" aria-label="Close navigation"><X size={19} /></button>
    </div>
    <div className="flex flex-1 flex-col px-5 pt-7 pb-4">
      <p className="mb-3 px-3 text-[9px] font-semibold tracking-[0.14em] text-muted uppercase">Your workspace</p>
      <button onClick={() => { setView("month"); setMobileMenu(false); }} className="flex items-center gap-3 rounded-lg bg-[#e5ecdC] px-3 py-3 text-xs font-semibold text-forest"><CalendarDays size={17} />Calendar<span className="ml-auto flex size-5 items-center justify-center rounded-md bg-white/60 text-[10px]">{events.length}</span></button>
      <button onClick={() => { setView("day"); selectDate(today); }} className="mt-1 flex items-center gap-3 rounded-lg px-3 py-3 text-xs text-muted hover:bg-sage hover:text-forest"><Clock3 size={17} />Today’s agenda<ArrowUpRight size={13} className="ml-auto" /></button>
      <div className="my-6 border-t border-line" />
      <MiniCalendar date={date} today={today} events={events} onSelect={selectDate} />
      <div className="mt-7 border-t border-line pt-6">
        <div className="mb-4 flex items-center justify-between px-1"><h3 className="text-[9px] font-semibold tracking-[0.14em] text-muted uppercase">My calendars</h3><Globe2 size={12} className="text-muted" /></div>
        <button onClick={() => setShowCalendar(!showCalendar)} aria-pressed={showCalendar} className="flex w-full items-center gap-2.5 rounded-lg px-1 py-2 text-xs hover:bg-sage">
          <span className={`flex size-3.5 items-center justify-center rounded border ${showCalendar ? "border-forest bg-forest text-white" : "border-muted/40 bg-white"}`}>{showCalendar && <Check size={10} strokeWidth={3} />}</span>
          <span className="font-medium">Shared calendar</span><span className="ml-auto size-1.5 rounded-full bg-[#89a473]" />
        </button>
        <p className="mt-1 pl-7 text-[10px] text-muted">A place for everyone’s plans</p>
      </div>
      <div className="mt-auto pt-12">
        <div className="rounded-xl border border-[#e1e7d7] bg-[#edf1e5] p-4">
          <div className="mb-3 flex size-8 items-center justify-center rounded-lg bg-white/70 text-forest"><Users size={16} /></div>
          <h3 className="text-xs font-semibold">{signedIn ? "You’re part of the plan." : "Room for everyone."}</h3>
          <p className="mt-1.5 text-[11px] leading-[1.7] text-[#7a8572]">{signedIn ? "Bring your people together, one good plan at a time." : "Life’s better with a few good plans and great company."}</p>
          <button onClick={() => signedIn ? createEvent(date) : setDialog({ type: "auth", mode: "register" })} className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold text-forest hover:text-forest-dark">{signedIn ? "Make a plan" : "Join the calendar"}<ArrowUpRight size={13} /></button>
        </div>
        <button onClick={() => { setDialog({ type: "help" }); setMobileMenu(false); }} className="mt-5 flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-[10px] text-muted hover:text-forest"><CircleHelp size={14} />A little help<span className="ml-auto text-[9px] text-muted/65">GATHER V.1</span></button>
      </div>
    </div>
  </>;

  return <div className="flex min-h-screen">
    <aside className="hidden w-[232px] shrink-0 flex-col border-r border-line bg-[#f5f7f0] lg:flex">{sidebar}</aside>
    {mobileMenu && <div className="fixed inset-0 z-40 bg-ink/25 backdrop-blur-sm lg:hidden" onClick={event => { if (event.target === event.currentTarget) setMobileMenu(false); }}><aside className="flex h-full w-[260px] flex-col overflow-y-auto border-r border-line bg-[#f5f7f0] shadow-xl">{sidebar}</aside></div>}
    <div className="min-w-0 flex-1">
      <header className="flex h-[77px] items-center justify-between gap-3 border-b border-line bg-white px-5 md:px-8">
        <div className="flex shrink-0 items-center gap-3">
          <IconButton onClick={() => setMobileMenu(true)} aria-label="Open navigation" className="lg:hidden"><Menu size={19} /></IconButton>
          <span className="hidden text-[11px] text-muted md:inline">Workspace</span><ChevronRight size={12} className="hidden text-muted/50 md:block" /><span className="text-[11px] font-medium">Shared calendar</span>
        </div>
        <div className="flex min-w-0 items-center gap-3 md:gap-5">
          <div className="relative hidden w-52 sm:block xl:w-60">
            <Search size={15} className="pointer-events-none absolute top-2.5 left-3 text-muted" />
            <input ref={searchRef} type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Find an event..." aria-label="Search events" className="h-9 w-full rounded-lg border border-line bg-[#fafbf8] pr-8 pl-9 text-[11px] outline-none placeholder:text-muted focus:border-forest/40" />
            {!search && <span className="pointer-events-none absolute top-2 right-2.5 rounded border border-line px-1.5 text-[10px] text-muted">/</span>}
          </div>
          <div className="hidden h-6 border-l border-line sm:block" />
          {signedIn ? <div className="flex items-center gap-2.5"><span className="flex size-8 items-center justify-center rounded-full bg-sage text-[10px] font-semibold text-forest">{eventInitials(username)}</span><span className="max-w-24 truncate text-xs font-medium">{username}</span><IconButton aria-label="Sign out" title="Sign out" onClick={() => void signOut()}><LogOut size={15} /></IconButton></div> : <button onClick={() => setDialog({ type: "auth", mode: "login" })} className="flex shrink-0 items-center gap-2 rounded-lg border border-line px-3.5 py-2 text-[11px] font-semibold hover:border-forest/30 hover:bg-sage">Sign in<ArrowRight size={13} /></button>}
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-4 py-7 md:px-8 md:py-8">
        <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-[9px] font-medium tracking-[0.16em] text-muted uppercase"><span className="size-1.5 rounded-full bg-[#94a782]" />A little more together</div>
            <h1 className="text-[29px] font-semibold tracking-[-1.1px]">Your calendar<span className="text-[#98aa86]">.</span></h1>
            <p className="mt-1.5 text-xs text-muted">Good plans, great company. See what’s on the horizon.</p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1.5 text-[10px] text-muted"><Globe2 size={12} className="text-[#789169]" /><span>Shared with everyone</span></div>
        </div>

        <div className="flex items-start gap-6">
          <section className="min-w-0 flex-1" aria-label="Event calendar">
            <div className="overflow-hidden rounded-xl border border-line bg-white shadow-[0_3px_16px_-10px_#293c3020]">
              <div className="flex flex-wrap items-center justify-between gap-4 px-5 pt-5 pb-4">
                <div className="flex items-center gap-3">
                  <h2 aria-live="polite" className="min-w-[140px] text-[18px] font-semibold tracking-[-0.5px] md:min-w-[155px]">{periodTitle(date, view)}</h2>
                  <div className="flex gap-0.5"><IconButton aria-label={`Previous ${view}`} onClick={() => navigate(-1)}><ChevronLeft size={17} /></IconButton><IconButton aria-label={`Next ${view}`} onClick={() => navigate(1)}><ChevronRight size={17} /></IconButton></div>
                  <button onClick={() => setDate(dayStart(new Date()))} className="rounded-md border border-line px-2.5 py-1.5 text-[10px] font-medium text-ink hover:bg-sage">Today</button>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex rounded-lg bg-[#f1f3ed] p-0.5" aria-label="Calendar view">
                    {(["month", "week", "day"] as const).map(option => <button key={option} onClick={() => setView(option)} aria-pressed={view === option} className={`rounded-md px-3 py-1.5 text-[10px] font-medium capitalize ${view === option ? "bg-white text-ink shadow-sm" : "text-muted hover:text-forest"}`}>{option}</button>)}
                  </div>
                  <button onClick={() => createEvent(date)} className={`${primaryButton} gap-1.5! px-3! py-2! text-[11px]!`}><Plus size={14} /><span>New event</span></button>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 px-5 pb-4">
                <div className="flex items-center gap-1.5 text-[10px] text-muted"><span className="size-1.5 rounded-full bg-[#8fa57c]" />{loading ? "Gathering your plans..." : `${periodEvents.length} ${periodEvents.length === 1 ? "event" : "events"} this ${view}`}{search && <span>· matching “{search}”</span>}{!showCalendar && <span>· calendar hidden</span>}</div>
                <div className="flex shrink-0 items-center gap-1.5 text-[9px] text-muted"><Globe2 size={11} />UTC timezone</div>
              </div>
              {loadError && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 border-t border-amber-200 bg-amber-50 px-5 py-3 text-xs text-amber-800"><p>{loadError}</p><button onClick={() => void loadEvents()} className="font-semibold underline">Try again</button></div>}
              {search && filteredEvents.length === 0 && !loading && <div role="status" className="flex items-center justify-between border-t border-line bg-sage/40 px-5 py-3 text-xs text-muted"><span>No events found. Try another search.</span><button className="font-semibold text-forest" onClick={() => setSearch("")}>Clear search</button></div>}
              <div className="overflow-x-auto border-t border-line">{view === "month" ? <MonthCalendar {...calendarProps} /> : <TimeCalendar {...calendarProps} view={view} />}</div>
              {view === "month" && <DayEventList {...calendarProps} />}
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 px-1 text-[10px] text-muted"><p className="flex items-center gap-1.5"><Leaf size={12} className="text-[#8da177]" />A little space for everything that matters.</p><button onClick={() => setDialog({ type: "help" })} className="flex items-center gap-1.5 hover:text-forest"><CircleHelp size={11} />Tips & shortcuts</button></div>
            <div className="mt-6 flex items-center gap-4 rounded-xl border border-line bg-[#f6f8f1] p-4 sm:p-5">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-[#e1e7d6] bg-[#edf1e4] text-[#768c60]"><Users size={19} /></div>
              <div className="min-w-0"><h3 className="text-xs font-semibold">One calendar. All your people.</h3><p className="mt-1 text-[11px] leading-relaxed text-muted">{signedIn ? "Your next good idea deserves a place on the calendar." : "Everyone’s welcome to explore. Sign in when you’re ready to make a plan."}</p></div>
              <button onClick={() => signedIn ? createEvent(date) : setDialog({ type: "auth", mode: "register" })} aria-label={signedIn ? "Create a new plan" : "Create an account"} className="ml-auto flex size-8 shrink-0 items-center justify-center rounded-full border border-[#d9e2ce] text-forest hover:bg-sage"><ArrowUpRight size={15} /></button>
            </div>
          </section>

          <aside className="hidden w-[224px] shrink-0 xl:block" aria-label="Upcoming events">
            <div className="rounded-xl border border-line bg-white p-5">
              <div className="flex items-center justify-between"><h2 className="text-[13px] font-semibold">On the horizon</h2><span className="flex size-6 items-center justify-center rounded-lg bg-sage/70 text-forest"><ArrowUpRight size={13} /></span></div>
              <p className="mt-2 text-[10px] text-muted">A look at what’s coming up.</p>
              {loading ? <div className="flex h-52 items-center justify-center"><Loader2 size={20} className="animate-spin text-muted" /></div> : upcomingEvents.length > 0 ? <div className="mt-5 space-y-4">
                {upcomingEvents.map(event => <button key={event.id} onClick={() => setDialog({ type: "detail", event })} className="group flex w-full items-start gap-3 text-left">
                  <div className="flex w-10 shrink-0 flex-col items-center rounded-lg border border-line bg-[#fafbf7] py-1.5"><span className="text-[8px] font-semibold tracking-wider text-muted uppercase">{formatDate(event.start_time, { month: "short" })}</span><span className="mt-0.5 text-[16px] font-semibold leading-tight">{formatDate(event.start_time, { day: "numeric" })}</span></div>
                  <div className="min-w-0 pt-1"><h3 className="truncate text-[11px] font-semibold group-hover:text-[#71925b]">{event.title}</h3><p className="mt-1.5 flex items-center gap-1 text-[9px] text-muted"><Clock3 size={10} />{shortTime(event.start_time)} – {shortTime(event.end_time)}</p>{event.location && <p className="mt-1 truncate text-[9px] text-muted">{event.location}</p>}</div>
                </button>)}
              </div> : <div className="pt-8 pb-7 text-center">
                <div className="relative mx-auto mb-5 flex h-[65px] w-[65px] -rotate-6 items-center justify-center rounded-xl border border-[#dfe6d7] bg-[#f0f4e9] text-[#879b71]">
                  <CalendarDays size={28} strokeWidth={1.3} /><span className="absolute -right-2 -bottom-1 flex size-6 rotate-6 items-center justify-center rounded-full border-[3px] border-white bg-[#dbe6cb] text-forest"><Leaf size={11} /></span>
                </div>
                <h3 className="text-xs font-medium">A little breathing room.</h3><p className="mx-auto mt-2 max-w-40 text-[10px] leading-[1.8] text-muted">{search ? "No upcoming plans match your search." : !showCalendar ? "Your shared calendar is hidden." : "No upcoming events just yet. There’s room for something good."}</p>
                <button onClick={() => createEvent(date)} className="mt-4 inline-flex items-center gap-1.5 text-[10px] font-semibold text-forest hover:text-forest-dark">Make a plan<Plus size={12} /></button>
              </div>}
              <button onClick={() => { setView("week"); setDate(today); }} className="mt-5 flex w-full items-center justify-between border-t border-line pt-4 text-[10px] font-medium text-muted hover:text-forest">See this week<ArrowRight size={12} /></button>
            </div>
            <div className="mt-5 overflow-hidden rounded-xl border border-[#e6e9dc] bg-[#f1f3e8] px-5 pt-6 pb-5 text-center">
              <p className="text-[8px] font-semibold tracking-[0.17em] text-[#899279] uppercase">Grow something good</p>
              <h3 className="mt-3 font-serif text-[25px] leading-[1.15] tracking-[-0.5px] text-[#4f6240]">Good plans.<br /><span className="italic">Great company.</span></h3>
              <div className="mt-2"><BotanicalIllustration /></div>
              <p className="mx-auto mt-3 max-w-40 text-[10px] leading-[1.8] text-[#879078]">A coffee, a catch-up, a big idea.<br />It all starts with a little time.</p>
              <button onClick={() => createEvent(date)} className="mt-4 rounded-lg border border-[#d9dfca] bg-white/50 px-3.5 py-2 text-[10px] font-semibold text-[#63764f] hover:bg-white">Let’s make a plan<ArrowUpRight size={11} className="ml-1.5 inline" /></button>
            </div>
            <div className="mt-5 flex items-center justify-between px-1"><span className="text-[9px] text-muted">This month, together</span><span className="text-xs font-semibold text-forest">{monthEventCount} <span className="text-[9px] font-normal text-muted">{monthEventCount === 1 ? "event" : "events"}</span></span></div>
          </aside>
        </div>
        <footer className="mt-8 flex items-center justify-between border-t border-line pt-4 text-[9px] text-muted/70"><span>Made for a little more together.</span><span className="flex items-center gap-1.5"><span className="size-1 rounded-full bg-[#94a782]" />Your shared space, at your pace.</span></footer>
      </main>
    </div>

    {dialog?.type === "auth" && <AuthDialog initialMode={dialog.mode} onClose={() => setDialog(null)} onAuthenticated={authenticate} />}
    {dialog?.type === "create" && <EventFormDialog date={dialog.date} token={token} onClose={() => setDialog(null)} onSaved={saveEvent} />}
    {dialog?.type === "edit" && <EventFormDialog event={dialog.event} date={new Date(dialog.event.start_time)} token={token} onClose={() => setDialog(null)} onSaved={saveEvent} />}
    {dialog?.type === "detail" && <EventDetailDialog event={dialog.event} token={signedIn ? token : ""} onClose={() => setDialog(null)} onEdit={() => setDialog({ type: "edit", event: dialog.event })} onDeleted={() => { setEvents(previous => previous.filter(event => event.id !== dialog.event.id)); setDialog(null); setToast("Event deleted. A little room for a new plan."); void loadEvents(); }} onSignIn={() => setDialog({ type: "auth", mode: "login" })} />}
    {dialog?.type === "help" && <HelpDialog onClose={() => setDialog(null)} />}
    {toast && <div role="status" className="fixed right-5 bottom-5 z-50 flex max-w-[calc(100vw-40px)] items-center gap-2.5 rounded-xl border border-[#d4e1cc] bg-white px-4 py-3 text-xs text-forest shadow-lg"><CheckCircle2 size={17} className="shrink-0" /><span>{toast}</span><button aria-label="Dismiss notification" onClick={() => setToast("")} className="ml-2 rounded p-1 text-muted hover:bg-sage"><X size={13} /></button></div>}
  </div>;
}

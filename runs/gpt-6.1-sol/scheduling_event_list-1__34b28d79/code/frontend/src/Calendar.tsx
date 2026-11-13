import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import type { CalendarEvent, View } from "./lib";
import { DAY, WEEKDAYS, addDays, changeMonth, dateKey, dayStart, eventsOnDay, formatDate, monthDays, monthStart, sameDay, shortTime, timeSegments } from "./lib";
import { IconButton } from "./ui";

type CalendarProps = {
  date: Date;
  days: Date[];
  events: CalendarEvent[];
  today: Date;
  signedIn: boolean;
  onSelect: (date: Date) => void;
  onCreate: (date: Date) => void;
  onEvent: (event: CalendarEvent) => void;
};

export function MiniCalendar({ date, today, events, onSelect }: Pick<CalendarProps, "date" | "today" | "events" | "onSelect">) {
  const [cursor, setCursor] = useState(monthStart(date));
  useEffect(() => { setCursor(monthStart(date)); }, [date]);
  return <div className="px-1">
    <div className="mb-4 flex items-center justify-between">
      <h3 className="text-xs font-semibold">{formatDate(cursor, { month: "long", year: "numeric" })}</h3>
      <div className="flex gap-0.5">
        <IconButton className="size-6!" aria-label="Previous mini-calendar month" onClick={() => setCursor(changeMonth(cursor, -1))}><ChevronLeft size={14} /></IconButton>
        <IconButton className="size-6!" aria-label="Next mini-calendar month" onClick={() => setCursor(changeMonth(cursor, 1))}><ChevronRight size={14} /></IconButton>
      </div>
    </div>
    <div className="grid grid-cols-7 gap-y-1 text-center">
      {WEEKDAYS.map(day => <div key={day} className="mb-1 text-[10px] font-medium text-muted">{day[0]}</div>)}
      {monthDays(cursor).map(day => {
        const selected = sameDay(day, date);
        const isToday = sameDay(day, today);
        const inMonth = day.getUTCMonth() === cursor.getUTCMonth();
        const hasEvents = eventsOnDay(events, day).length > 0;
        return <button key={dateKey(day)} aria-label={formatDate(day, { dateStyle: "full" })} aria-pressed={selected} onClick={() => onSelect(day)} className={`relative mx-auto flex size-7 items-center justify-center rounded-full text-[11px] ${selected ? "bg-forest font-semibold text-white" : isToday ? "bg-sage font-semibold text-forest ring-1 ring-forest/20" : inMonth ? "text-ink hover:bg-sage" : "text-muted/40 hover:bg-sage"}`}>
          {day.getUTCDate()}
          {hasEvents && <span className={`absolute bottom-0.5 size-0.5 rounded-full ${selected ? "bg-white" : "bg-forest"}`} />}
        </button>;
      })}
    </div>
  </div>;
}

export function MonthCalendar({ date, days, events, today, signedIn, onSelect, onCreate, onEvent }: CalendarProps) {
  return <div className="min-w-[620px]">
    <div className="grid grid-cols-7 border-b border-line bg-[#fafbf8]">
      {WEEKDAYS.map((day, i) => <div key={day} className={`py-3.5 text-center text-[10px] font-semibold tracking-[0.1em] uppercase ${i > 4 ? "text-muted/70" : "text-muted"}`}>{day}</div>)}
    </div>
    <div className="grid grid-cols-7">
      {days.map((day, index) => {
        const dayEvents = eventsOnDay(events, day);
        const currentMonth = day.getUTCMonth() === date.getUTCMonth();
        const selected = sameDay(day, date);
        const isToday = sameDay(day, today);
        const weekend = index % 7 > 4;
        return <div key={dateKey(day)} className={`group relative border-line p-2.5 ${days.length === 42 ? "min-h-[80px]" : "min-h-[96px]"} ${index % 7 !== 6 ? "border-r" : ""} ${index < days.length - 7 ? "border-b" : ""} ${selected ? "bg-[#f1f5ed]" : !currentMonth ? "bg-[#fafbf8]" : weekend ? "bg-[#fcfdfb]" : "bg-white"}`}>
          <div className="mb-2 flex items-center justify-between">
            <button aria-label={`Select ${formatDate(day, { dateStyle: "full" })}`} aria-pressed={selected} onClick={() => onSelect(day)} className={`flex size-7 items-center justify-center rounded-full text-xs ${isToday ? "bg-forest font-semibold text-white" : currentMonth ? "font-medium text-ink hover:bg-sage" : "text-muted/45 hover:bg-sage"}`}>
              {day.getUTCDate()}
            </button>
            {isToday && <span className="mr-auto ml-1 hidden text-[9px] font-medium text-forest xl:block">Today</span>}
            {signedIn && <button aria-label={`Create event on ${dateKey(day)}`} onClick={() => onCreate(day)} className="flex size-6 items-center justify-center rounded-md text-forest opacity-0 hover:bg-white group-hover:opacity-100 focus:opacity-100"><Plus size={13} /></button>}
          </div>
          <div className="space-y-1">
            {dayEvents.slice(0, 3).map(event => <button key={event.id} onClick={() => onEvent(event)} title={`${event.title} · ${shortTime(event.start_time)}`} className="flex w-full items-center gap-1.5 overflow-hidden rounded border-l-2 border-[#759165] bg-[#e9efdf] px-1.5 py-1.5 text-left text-[10px] text-forest-dark hover:bg-[#dce7cf]">
              <span className="truncate font-semibold">{event.title}</span>
              <span className="ml-auto shrink-0 text-[9px] font-normal opacity-70">{new Date(event.start_time).getTime() < dayStart(day).getTime() ? "↳" : shortTime(event.start_time)}</span>
            </button>)}
            {dayEvents.length > 3 && <button onClick={() => onSelect(day)} className="rounded px-1.5 py-0.5 text-[10px] font-medium text-muted hover:text-forest">+{dayEvents.length - 3} more</button>}
          </div>
        </div>;
      })}
    </div>
  </div>;
}

export function TimeCalendar({ days, events, today, signedIn, onSelect, onCreate, onEvent, view }: CalendarProps & { view: View }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 7 * 64; }, [view]);
  const now = new Date();
  const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  return <div className={view === "week" ? "min-w-[620px]" : "min-w-[300px]"}>
    <div className="flex border-b border-line bg-[#fafbf8]">
      <div className="flex w-14 shrink-0 items-end justify-center pb-3 text-[9px] font-medium text-muted">UTC</div>
      {days.map(day => <button key={dateKey(day)} onClick={() => onSelect(day)} className="flex flex-1 flex-col items-center gap-1.5 border-l border-line py-3 hover:bg-sage">
        <span className="text-[10px] font-medium tracking-wider text-muted uppercase">{formatDate(day, { weekday: "short" })}</span>
        <span className={`flex size-8 items-center justify-center rounded-full text-base font-medium ${sameDay(day, today) ? "bg-forest text-white" : "text-ink"}`}>{day.getUTCDate()}</span>
      </button>)}
    </div>
    <div ref={scrollRef} className="max-h-[560px] overflow-y-auto">
      <div className="relative flex h-[1536px]">
        <div className="relative w-14 shrink-0 bg-white">
          {Array.from({ length: 24 }, (_, hour) => <span key={hour} style={{ top: hour * 64 }} className="absolute right-2.5 -translate-y-1/2 text-[9px] text-muted">{hour === 0 ? "" : `${hour % 12 || 12} ${hour < 12 ? "AM" : "PM"}`}</span>)}
        </div>
        {days.map(day => <div key={dateKey(day)} className={`relative flex-1 border-l border-line ${sameDay(day, today) ? "bg-[#f8faf4]" : "bg-white"}`}>
          {Array.from({ length: 24 }, (_, hour) => <button key={hour} disabled={!signedIn} aria-label={`Create event ${dateKey(day)} at ${hour}:00 UTC`} onClick={() => onCreate(new Date(day.getTime() + hour * DAY / 24))} style={{ top: hour * 64 }} className="group absolute h-16 w-full border-t border-line text-forest hover:bg-sage/60 disabled:cursor-default disabled:hover:bg-transparent">
            {signedIn && <Plus size={14} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100" />}
          </button>)}
          {timeSegments(events, day).map(({ event, start, end, column, columns }) => <button key={event.id} onClick={() => onEvent(event)} style={{ top: start / 60 * 64, height: Math.max((end - start) / 60 * 64, 22), left: `calc(${column / columns * 100}% + 3px)`, width: `calc(${100 / columns}% - 6px)` }} className="absolute z-10 overflow-hidden rounded-md border-l-[3px] border-[#7d966b] bg-[#e9efdf] p-2 text-left text-forest-dark shadow-sm hover:bg-[#dce7cf]">
            <p className="truncate text-[11px] font-semibold">{event.title}</p>
            {end - start >= 35 && <p className="mt-1 truncate text-[10px] opacity-70">{shortTime(event.start_time)} – {shortTime(event.end_time)}</p>}
            {end - start >= 75 && event.location && <p className="mt-2 truncate text-[10px] opacity-60">{event.location}</p>}
          </button>)}
          {sameDay(day, today) && <div style={{ top: nowMinutes / 60 * 64 }} className="pointer-events-none absolute z-20 w-full border-t border-[#bd7757]"><span className="absolute -top-1 -left-1 size-2 rounded-full bg-[#bd7757]" /></div>}
        </div>)}
      </div>
    </div>
    <div className="border-t border-line bg-white px-4 py-2.5 text-[10px] text-muted">{signedIn ? "Click a time slot to add an event." : "Sign in to add an event to the calendar."} All times are in UTC.</div>
  </div>;
}

export function DayEventList({ date, events, onEvent, onCreate, signedIn }: Pick<CalendarProps, "date" | "events" | "onEvent" | "onCreate" | "signedIn">) {
  const dayEvents = eventsOnDay(events, date);
  return <div className="border-t border-line bg-[#fafbf8] px-5 py-4">
    <div className="flex items-center justify-between">
      <h3 className="text-xs font-semibold">{formatDate(date, { weekday: "long", month: "short", day: "numeric" })}<span className="ml-2 font-normal text-muted">· {dayEvents.length} {dayEvents.length === 1 ? "event" : "events"}</span></h3>
      {signedIn && <button onClick={() => onCreate(addDays(date, 0))} className="inline-flex items-center gap-1 text-[11px] font-medium text-forest hover:text-forest-dark"><Plus size={13} />Add event</button>}
    </div>
    {dayEvents.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{dayEvents.map(event => <button key={event.id} onClick={() => onEvent(event)} className="flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-xs hover:border-forest/30"><span className="size-1.5 rounded-full bg-forest" /><span className="font-medium">{event.title}</span><span className="text-muted">{shortTime(event.start_time)}</span></button>)}</div>}
    {dayEvents.length === 0 && <p className="mt-2 text-[11px] text-muted">Nothing on the calendar. A little space for something good.</p>}
  </div>;
}

import { addDays, dayKey, eventDayKeys, formatTimeOfDay, MONTHS_SHORT, todayKey, WEEKDAYS_SHORT } from "../dates";
import type { CalendarEvent } from "../types";

interface BaseProps {
  eventsByDay: Map<string, CalendarEvent[]>;
  onSelectEvent: (event: CalendarEvent) => void;
  onCreateAt: (day: string) => void;
  signedIn: boolean;
}

interface MonthProps extends BaseProps {
  anchor: Date;
  weeks: Date[][];
  onShowDay: (day: string) => void;
}

interface WeekProps extends BaseProps {
  weekStart: Date;
}

interface DayProps extends BaseProps {
  day: Date;
}

function chipCls() {
  return "block w-full truncate rounded bg-indigo-50 px-1.5 py-0.5 text-left text-xs text-indigo-800 hover:bg-indigo-100";
}

function EventChip({ event, onSelect }: { event: CalendarEvent; onSelect: (e: CalendarEvent) => void }) {
  return (
    <button
      type="button"
      className={chipCls()}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(event);
      }}
    >
      <span className="font-semibold">{formatTimeOfDay(event.start_time)}</span> {event.title}
    </button>
  );
}

function EventCard({ event, onSelect }: { event: CalendarEvent; onSelect: (e: CalendarEvent) => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onSelect(event);
      }}
      className="w-full rounded-lg border border-indigo-100 bg-indigo-50 p-2 text-left hover:border-indigo-200 hover:bg-indigo-100"
    >
      <div className="text-xs font-semibold text-indigo-700">
        {formatTimeOfDay(event.start_time)}
        {event.end_time && <> – {formatTimeOfDay(event.end_time)}</>}
      </div>
      <div className="truncate text-sm font-medium text-slate-900">{event.title}</div>
      {event.location && <div className="truncate text-xs text-slate-500">{event.location}</div>}
    </button>
  );
}

export function MonthView({ anchor, weeks, eventsByDay, onSelectEvent, onCreateAt, onShowDay, signedIn }: MonthProps) {
  const today = todayKey();
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
        {WEEKDAYS_SHORT.map((name) => (
          <div key={name} className="py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
            {name}
          </div>
        ))}
      </div>
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7">
          {week.map((d) => {
            const key = dayKey(d);
            const dayEvents = eventsByDay.get(key) ?? [];
            const outside = d.getUTCMonth() !== anchor.getUTCMonth();
            const isToday = key === today;
            return (
              <div
                key={key}
                role={signedIn ? "button" : undefined}
                tabIndex={signedIn ? 0 : undefined}
                onClick={() => signedIn && onCreateAt(key)}
                onKeyDown={(e) => {
                  if (signedIn && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    onCreateAt(key);
                  }
                }}
                className={`min-h-[7.5rem] border-b border-r border-slate-100 p-1.5 last:border-r-0 ${
                  outside ? "bg-slate-50/60" : "bg-white"
                } ${signedIn ? "cursor-pointer hover:bg-indigo-50/40" : ""}`}
              >
                <div className="mb-1 flex justify-start">
                  <span
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                      isToday
                        ? "bg-indigo-600 text-white"
                        : outside
                          ? "text-slate-400"
                          : "text-slate-700"
                    }`}
                  >
                    {d.getUTCDate()}
                  </span>
                </div>
                <div className="space-y-0.5">
                  {dayEvents.slice(0, 3).map((event) => (
                    <EventChip key={event.id} event={event} onSelect={onSelectEvent} />
                  ))}
                  {dayEvents.length > 3 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onShowDay(key);
                      }}
                      className="w-full rounded px-1.5 py-0.5 text-left text-xs font-medium text-slate-500 hover:bg-slate-100"
                    >
                      +{dayEvents.length - 3} more
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function WeekView({ weekStart, eventsByDay, onSelectEvent, onCreateAt, signedIn }: WeekProps) {
  const today = todayKey();
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
        {days.map((d) => {
          const key = dayKey(d);
          const isToday = key === today;
          return (
            <div key={key} className="border-r border-slate-200 px-2 py-2 text-center last:border-r-0">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {WEEKDAYS_SHORT[d.getUTCDay()]}
              </div>
              <div
                className={`mx-auto mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${
                  isToday ? "bg-indigo-600 text-white" : "text-slate-800"
                }`}
              >
                {d.getUTCDate()}
              </div>
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const key = dayKey(d);
          const dayEvents = eventsByDay.get(key) ?? [];
          return (
            <div
              key={key}
              role={signedIn ? "button" : undefined}
              tabIndex={signedIn ? 0 : undefined}
              onClick={() => signedIn && onCreateAt(key)}
              onKeyDown={(e) => {
                if (signedIn && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  onCreateAt(key);
                }
              }}
              className={`min-h-[22rem] space-y-1.5 border-r border-slate-100 p-2 last:border-r-0 ${
                signedIn ? "cursor-pointer hover:bg-indigo-50/40" : ""
              }`}
            >
              {dayEvents.length === 0 ? (
                <p className="pt-2 text-center text-xs text-slate-300">—</p>
              ) : (
                dayEvents.map((event) => <EventCard key={event.id} event={event} onSelect={onSelectEvent} />)
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function DayView({ day, eventsByDay, onSelectEvent, onCreateAt, signedIn }: DayProps) {
  const key = dayKey(day);
  const dayEvents = eventsByDay.get(key) ?? [];
  return (
    <div
      role={signedIn ? "button" : undefined}
      tabIndex={signedIn ? 0 : undefined}
      onClick={() => signedIn && onCreateAt(key)}
      onKeyDown={(e) => {
        if (signedIn && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onCreateAt(key);
        }
      }}
      className={`min-h-[24rem] rounded-xl border border-slate-200 bg-white p-4 shadow-sm ${
        signedIn ? "cursor-pointer hover:bg-indigo-50/30" : ""
      }`}
    >
      <h2 className="mb-3 text-sm font-semibold text-slate-500">
        {MONTHS_SHORT[day.getUTCMonth()]} {day.getUTCDate()} · {dayEvents.length}{" "}
        {dayEvents.length === 1 ? "event" : "events"}
      </h2>
      {dayEvents.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">No events on this day</p>
      ) : (
        <ul className="space-y-2">
          {dayEvents.map((event) => (
            <li key={event.id}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectEvent(event);
                }}
                className="flex w-full items-start gap-4 rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-indigo-200 hover:bg-indigo-50/50"
              >
                <div className="w-28 shrink-0 text-sm font-semibold text-indigo-700">
                  {formatTimeOfDay(event.start_time)}
                  {event.end_time && (
                    <span className="block font-normal text-slate-500">
                      to {formatTimeOfDay(event.end_time)}
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="truncate font-medium text-slate-900">{event.title}</div>
                  {event.location && <div className="truncate text-sm text-slate-500">{event.location}</div>}
                  {event.description && (
                    <p className="mt-1 line-clamp-2 text-sm text-slate-500">{event.description}</p>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function eventsToDayMap(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    for (const key of eventDayKeys(event)) {
      const list = map.get(key);
      if (list) {
        list.push(event);
      } else {
        map.set(key, [event]);
      }
    }
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.start_time.localeCompare(b.start_time) || a.id - b.id);
  }
  return map;
}

import { type Event } from "../api";
import {
  addDays,
  dateKey,
  formatTime,
  isSameDayUTC,
  overlapsDay,
  parseAPI,
  startOfWeek,
  todayUTC,
} from "../dates";

const WEEKDAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const DOT_COLORS = [
  "bg-indigo-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-sky-500",
  "bg-violet-500",
];

function dotColor(id: number): string {
  return DOT_COLORS[id % DOT_COLORS.length];
}

export function monthGrid(anchor: Date): Date[] {
  const first = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1));
  const last = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 0));
  const start = startOfWeek(first);
  let end = startOfWeek(last);
  if (end.getTime() !== last.getTime()) end = addDays(end, 7);
  const days: Date[] = [];
  for (let d = start; d.getTime() <= end.getTime(); d = addDays(d, 1)) {
    days.push(d);
  }
  return days;
}

export default function MonthView({
  anchor,
  events,
  showMoreKeys,
  onSelect,
  onCreateOnDay,
  onToggleMore,
  onDateClick,
}: {
  anchor: Date;
  events: Event[];
  showMoreKeys: Set<string>;
  onSelect: (event: Event) => void;
  onCreateOnDay: (day: Date) => void;
  onToggleMore: (key: string) => void;
  onDateClick: (day: Date) => void;
}) {
  const days = monthGrid(anchor);
  const perDay = new Map<string, Event[]>();
  for (const event of events) {
    const start = parseAPI(event.start_time);
    const end = parseAPI(event.end_time);
    for (const day of days) {
      if (overlapsDay(day, start, end)) {
        const key = dateKey(day);
        const list = perDay.get(key) ?? [];
        list.push(event);
        perDay.set(key, list);
      }
    }
  }
  for (const list of perDay.values()) {
    list.sort((a, b) => a.start_time.localeCompare(b.start_time) || a.id - b.id);
  }

  const rows: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) rows.push(days.slice(i, i + 7));

  const today = todayUTC();

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="min-w-[640px]">
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
          {WEEKDAYS_SHORT.map((wd) => (
            <div
              key={wd}
              className="px-2 py-1.5 text-center text-xs font-semibold text-slate-500"
            >
              {wd}
            </div>
          ))}
        </div>
        {rows.map((week, wi) => (
          <div
            key={wi}
            className="grid grid-cols-7"
            style={{ gridAutoRows: "minmax(7.5rem, auto)" }}
          >
            {week.map((day) => {
              const key = dateKey(day);
              const dayEvents = perDay.get(key) ?? [];
              const inMonth = day.getUTCMonth() === anchor.getUTCMonth();
              const isToday = isSameDayUTC(day, today);
              const expanded = showMoreKeys.has(key);
              const shown = expanded ? dayEvents : dayEvents.slice(0, 4);
              const hidden = dayEvents.length - shown.length;
              return (
                <div
                  key={key}
                  className={`group border-b border-r border-slate-100 p-1 ${
                    inMonth ? "bg-white" : "bg-slate-50"
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => onDateClick(day)}
                      className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-medium hover:bg-indigo-100 ${
                        isToday
                          ? "bg-indigo-600 text-white hover:bg-indigo-500"
                          : inMonth
                            ? "text-slate-700"
                            : "text-slate-400"
                      }`}
                    >
                      {day.getUTCDate()}
                    </button>
                    <button
                      type="button"
                      title="New event on this day"
                      onClick={() => onCreateOnDay(day)}
                      className="hidden h-5 w-5 items-center justify-center rounded text-sm font-bold text-slate-400 hover:bg-indigo-100 hover:text-indigo-600 group-hover:flex"
                    >
                      +
                    </button>
                  </div>
                  <div className="space-y-0.5">
                    {shown.map((event) => (
                      <button
                        key={event.id}
                        type="button"
                        onClick={() => onSelect(event)}
                        className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-[11px] hover:bg-indigo-50"
                        title={`${event.title} · ${formatTime(parseAPI(event.start_time))} UTC`}
                      >
                        <span
                          className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotColor(event.id)}`}
                        />
                        <span className="truncate text-slate-500">
                          {formatTime(parseAPI(event.start_time))}
                        </span>
                        <span className="truncate font-medium text-slate-800">
                          {event.title}
                        </span>
                      </button>
                    ))}
                    {dayEvents.length > 4 && (
                      <button
                        type="button"
                        onClick={() => onToggleMore(key)}
                        className="block w-full px-1 text-left text-[11px] font-medium text-indigo-600 hover:underline"
                      >
                        {expanded
                          ? "Show less"
                          : `+${hidden} more`}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

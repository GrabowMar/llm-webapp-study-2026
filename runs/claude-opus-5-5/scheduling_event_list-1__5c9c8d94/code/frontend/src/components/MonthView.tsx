import type { CalendarEvent } from "../api";
import { addDays, formatTime, isSameDay, startOfDay, visibleRange, weekdayLabels } from "../dates";
import { eventsOnDay } from "./layout";

interface MonthViewProps {
  cursor: Date;
  events: CalendarEvent[];
  onSelectEvent: (event: CalendarEvent) => void;
  onSelectDay: (day: Date) => void;
}

const MAX_PER_CELL = 3;

export default function MonthView({ cursor, events, onSelectEvent, onSelectDay }: MonthViewProps) {
  const { start } = visibleRange("month", cursor);
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const today = new Date();
  const labels = weekdayLabels();

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
        {labels.map((label) => (
          <div key={label} className="py-2">
            {label}
          </div>
        ))}
      </div>
      <div className="grid flex-1 grid-cols-7 grid-rows-6">
        {days.map((day) => {
          const inMonth = day.getMonth() === cursor.getMonth();
          const isToday = isSameDay(day, today);
          const dayEvents = eventsOnDay(events, day);
          const shown = dayEvents.slice(0, MAX_PER_CELL);
          const hidden = dayEvents.length - shown.length;
          return (
            <div
              key={day.toISOString()}
              className={`min-h-24 border-b border-r border-slate-200 p-1 [&:nth-child(7n)]:border-r-0 ${inMonth ? "bg-white" : "bg-slate-50"}`}
            >
              <button
                type="button"
                onClick={() => onSelectDay(day)}
                aria-label={`View ${day.toLocaleDateString(undefined, { dateStyle: "full" })}`}
                className={`mb-1 flex h-7 w-7 items-center justify-center rounded-full text-sm hover:bg-slate-200 ${
                  isToday
                    ? "bg-indigo-600 font-semibold text-white hover:bg-indigo-500"
                    : inMonth
                      ? "text-slate-800"
                      : "text-slate-400"
                }`}
              >
                {day.getDate()}
              </button>
              <ul className="space-y-0.5">
                {shown.map((event) => {
                  const s = new Date(event.start_time);
                  const continued = s < startOfDay(day);
                  return (
                    <li key={event.id}>
                      <button
                        type="button"
                        onClick={() => onSelectEvent(event)}
                        title={event.title}
                        className="flex w-full items-center gap-1 truncate rounded bg-indigo-50 px-1.5 py-0.5 text-left text-xs text-indigo-900 hover:bg-indigo-100"
                      >
                        <span className="shrink-0 font-medium text-indigo-600">
                          {continued ? "↳" : formatTime(s)}
                        </span>
                        <span className="truncate">{event.title}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {hidden > 0 && (
                <button
                  type="button"
                  onClick={() => onSelectDay(day)}
                  className="mt-0.5 px-1.5 text-xs font-medium text-slate-600 hover:text-indigo-700 hover:underline"
                >
                  +{hidden} more
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

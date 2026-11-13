import { useEffect, useRef } from "react";
import type { CalendarEvent } from "../api";
import { addDays, formatTime, hourLabel, isSameDay, startOfDay } from "../dates";
import { eventsOnDay, layoutDay, spansMultipleDays } from "./layout";

interface TimeGridViewProps {
  days: Date[];
  events: CalendarEvent[];
  onSelectEvent: (event: CalendarEvent) => void;
  onSelectDay?: (day: Date) => void;
  onCreateAt?: (start: Date) => void;
}

const HOUR_HEIGHT = 48;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export default function TimeGridView({ days, events, onSelectEvent, onSelectDay, onCreateAt }: TimeGridViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const today = new Date();

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = HOUR_HEIGHT * 7.5;
  }, []);

  const multiDay = events.filter(spansMultipleDays);
  const timed = events.filter((e) => !spansMultipleDays(e));
  const hasAllDay = days.some((d) => eventsOnDay(multiDay, d).length > 0);
  const cols = days.length === 1 ? "grid-cols-[4rem_1fr]" : "grid-cols-[4rem_repeat(7,minmax(0,1fr))]";

  const nowMinutes = today.getHours() * 60 + today.getMinutes();

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className={`grid ${cols} border-b border-slate-200 bg-slate-50`}>
        <div />
        {days.map((day) => {
          const isToday = isSameDay(day, today);
          const label = (
            <>
              <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                {day.toLocaleDateString(undefined, { weekday: "short" })}
              </span>
              <span
                className={`mx-auto mt-0.5 flex h-8 w-8 items-center justify-center rounded-full text-lg ${
                  isToday ? "bg-indigo-600 font-semibold text-white" : "text-slate-800"
                }`}
              >
                {day.getDate()}
              </span>
            </>
          );
          return (
            <div key={day.toISOString()} className="border-l border-slate-200 py-2 text-center">
              {onSelectDay ? (
                <button
                  type="button"
                  onClick={() => onSelectDay(day)}
                  className="w-full rounded hover:bg-slate-100"
                  aria-label={`View ${day.toLocaleDateString(undefined, { dateStyle: "full" })}`}
                >
                  {label}
                </button>
              ) : (
                label
              )}
            </div>
          );
        })}
      </div>

      {hasAllDay && (
        <div className={`grid ${cols} border-b border-slate-200`}>
          <div className="px-1 py-1 text-right text-[10px] uppercase text-slate-400">Multi-day</div>
          {days.map((day) => (
            <div key={day.toISOString()} className="space-y-0.5 border-l border-slate-200 p-1">
              {eventsOnDay(multiDay, day).map((event) => (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => onSelectEvent(event)}
                  title={event.title}
                  className="block w-full truncate rounded bg-indigo-600 px-1.5 py-0.5 text-left text-xs font-medium text-white hover:bg-indigo-500"
                >
                  {event.title}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className={`relative grid ${cols}`} style={{ height: HOUR_HEIGHT * 24 }}>
          <div className="relative">
            {HOURS.map((h) => (
              <div
                key={h}
                className="absolute right-2 -translate-y-1/2 text-[11px] text-slate-400"
                style={{ top: h * HOUR_HEIGHT }}
              >
                {h === 0 ? "" : hourLabel(h)}
              </div>
            ))}
          </div>
          {days.map((day) => {
            const segments = layoutDay(eventsOnDay(timed, day), day);
            const dayStart = startOfDay(day);
            return (
              <div key={day.toISOString()} className="relative border-l border-slate-200">
                {HOURS.map((h) => (
                  <div
                    key={h}
                    onClick={
                      onCreateAt
                        ? () => onCreateAt(new Date(day.getFullYear(), day.getMonth(), day.getDate(), h))
                        : undefined
                    }
                    className={`absolute inset-x-0 border-t border-slate-100 ${onCreateAt ? "cursor-pointer hover:bg-indigo-50/50" : ""}`}
                    style={{ top: h * HOUR_HEIGHT, height: HOUR_HEIGHT }}
                  />
                ))}
                {isSameDay(day, today) && (
                  <div
                    className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-red-500"
                    style={{ top: (nowMinutes / 60) * HOUR_HEIGHT }}
                  >
                    <div className="-mt-[5px] -ml-1 h-2 w-2 rounded-full bg-red-500" />
                  </div>
                )}
                {segments.map((seg) => {
                  const startMin = (seg.start.getTime() - dayStart.getTime()) / 60000;
                  const endMin = Math.min((seg.end.getTime() - dayStart.getTime()) / 60000, 24 * 60);
                  const top = (startMin / 60) * HOUR_HEIGHT;
                  const height = Math.max(((endMin - startMin) / 60) * HOUR_HEIGHT, 20);
                  const width = 100 / seg.columns;
                  const s = new Date(seg.event.start_time);
                  const e = new Date(seg.event.end_time);
                  return (
                    <button
                      key={seg.event.id}
                      type="button"
                      onClick={() => onSelectEvent(seg.event)}
                      title={`${seg.event.title} (${formatTime(s)} – ${formatTime(e)})`}
                      className="absolute z-10 overflow-hidden rounded-md border border-white bg-indigo-100 px-1.5 py-0.5 text-left text-xs text-indigo-900 shadow-sm hover:z-30 hover:bg-indigo-200"
                      style={{
                        top,
                        height,
                        left: `calc(${seg.column * width}% + 2px)`,
                        width: `calc(${width}% - 4px)`,
                      }}
                    >
                      <span className="block truncate font-semibold">{seg.event.title}</span>
                      {height >= 36 && (
                        <span className="block truncate text-indigo-700">
                          {formatTime(s)} – {formatTime(e)}
                        </span>
                      )}
                      {height >= 52 && seg.event.location && (
                        <span className="block truncate text-indigo-700">{seg.event.location}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function weekDays(start: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

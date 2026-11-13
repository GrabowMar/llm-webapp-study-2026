import { CalendarEvent } from "../lib/api";
import {
  addDays,
  eventCoversDay,
  formatLongDate,
  formatTime,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  ViewMode,
} from "../lib/datetime";

interface Props {
  view: ViewMode;
  anchor: Date;
  events: CalendarEvent[];
  onSelectEvent: (event: CalendarEvent) => void;
  onSelectDay: (day: Date) => void;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function eventsForDay(events: CalendarEvent[], day: Date): CalendarEvent[] {
  return events
    .filter((event) => eventCoversDay(event, day))
    .sort(
      (a, b) =>
        new Date(a.start_time).getTime() - new Date(b.start_time).getTime() ||
        a.id - b.id,
    );
}

function dayNumberClass(day: Date, anchor: Date): string {
  const base =
    "inline-flex h-7 w-7 items-center justify-center rounded-full text-sm";
  if (isSameDay(day, new Date())) {
    return `${base} bg-blue-600 font-semibold text-white`;
  }
  if (isSameMonth(day, anchor)) {
    return `${base} text-slate-700`;
  }
  return `${base} text-slate-400`;
}

function EventChip({
  event,
  onSelect,
}: {
  event: CalendarEvent;
  onSelect: (event: CalendarEvent) => void;
}) {
  return (
    <button
      type="button"
      onClick={(clickEvent) => {
        clickEvent.stopPropagation();
        onSelect(event);
      }}
      title={event.title}
      className="mt-1 block w-full truncate rounded border-l-4 border-blue-500 bg-blue-50 px-1.5 py-1 text-left text-xs font-medium text-blue-800 hover:bg-blue-100"
    >
      <span className="text-blue-600/80">
        {formatTime(new Date(event.start_time))}
      </span>{" "}
      {event.title}
    </button>
  );
}

function MonthView({
  anchor,
  events,
  onSelectEvent,
  onSelectDay,
}: Omit<Props, "view">) {
  const gridStart = startOfWeek(startOfMonth(anchor));
  const days = Array.from({ length: 42 }, (_, index) =>
    addDays(gridStart, index),
  );

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="grid grid-cols-7 gap-px bg-slate-200">
        {WEEKDAYS.map((weekday) => (
          <div
            key={weekday}
            className="bg-slate-50 px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-500"
          >
            {weekday}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px bg-slate-200">
        {days.map((day) => {
          const dayEvents = eventsForDay(events, day);
          const visible = dayEvents.slice(0, 3);
          const hidden = dayEvents.length - visible.length;
          return (
            <div
              key={day.toISOString()}
              onClick={() => onSelectDay(day)}
              className={`min-h-28 cursor-pointer p-1.5 ${
                isSameMonth(day, anchor) ? "bg-white" : "bg-slate-50"
              }`}
            >
              <div className="flex justify-end">
                <span className={dayNumberClass(day, anchor)}>
                  {day.getUTCDate()}
                </span>
              </div>
              {visible.map((event) => (
                <EventChip
                  key={event.id}
                  event={event}
                  onSelect={onSelectEvent}
                />
              ))}
              {hidden > 0 && (
                <div className="mt-1 px-1.5 text-xs text-slate-500">
                  +{hidden} more
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekView({
  anchor,
  events,
  onSelectEvent,
  onSelectDay,
}: Omit<Props, "view">) {
  const weekStart = startOfWeek(anchor);
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="grid grid-cols-7 gap-px bg-slate-200">
        {days.map((day) => (
          <div
            key={day.toISOString()}
            onClick={() => onSelectDay(day)}
            className={`cursor-pointer px-2 py-2 text-center ${
              isSameMonth(day, anchor) ? "bg-slate-50" : "bg-slate-100/70"
            }`}
          >
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {WEEKDAYS[(day.getUTCDay() + 6) % 7]}
            </div>
            <div className={`mt-1 text-sm ${dayNumberClass(day, anchor)}`}>
              {day.getUTCDate()}
            </div>
          </div>
        ))}
      </div>
      <div className="grid min-h-96 grid-cols-7 gap-px bg-slate-200">
        {days.map((day) => {
          const dayEvents = eventsForDay(events, day);
          return (
            <div
              key={day.toISOString()}
              onClick={() => onSelectDay(day)}
              className="cursor-pointer bg-white p-1.5"
            >
              {dayEvents.map((event) => (
                <EventChip
                  key={event.id}
                  event={event}
                  onSelect={onSelectEvent}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DayView({
  anchor,
  events,
  onSelectEvent,
}: Omit<Props, "view" | "onSelectDay">) {
  const dayEvents = eventsForDay(events, anchor);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        {formatLongDate(anchor)}
      </h2>
      <div className="mt-4 space-y-2">
        {dayEvents.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            No events on this day.
          </p>
        ) : (
          dayEvents.map((event) => {
            const start = new Date(event.start_time);
            const end = new Date(event.end_time);
            return (
              <button
                key={event.id}
                type="button"
                onClick={() => onSelectEvent(event)}
                className="flex w-full items-start gap-4 rounded-lg border border-slate-200 bg-white p-4 text-left hover:border-blue-300 hover:bg-blue-50"
              >
                <div className="w-24 shrink-0 text-sm font-medium tabular-nums text-slate-600">
                  <div>{formatTime(start)}</div>
                  <div className="text-slate-400">{formatTime(end)}</div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-slate-900">
                    {event.title}
                  </div>
                  {event.location && (
                    <div className="mt-0.5 truncate text-sm text-slate-500">
                      {event.location}
                    </div>
                  )}
                  {event.description && (
                    <p className="mt-1 line-clamp-2 text-sm text-slate-600">
                      {event.description}
                    </p>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

export default function CalendarView(props: Props) {
  if (props.view === "day") {
    return <DayView {...props} />;
  }
  if (props.view === "week") {
    return <WeekView {...props} />;
  }
  return <MonthView {...props} />;
}

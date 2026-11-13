import type { EventItem } from "../types";
import { fmtTime, sameDay } from "../date";

interface Props {
  day: Date;
  events: EventItem[];
  isToday: boolean;
  onSelect: (event: EventItem) => void;
}

export function EventCard({
  event,
  onSelect,
}: {
  event: EventItem;
  onSelect: (event: EventItem) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(event)}
      className="w-full rounded-lg border-l-4 border-indigo-500 bg-indigo-50 px-2 py-1.5 text-left shadow-sm transition hover:bg-indigo-100"
    >
      <div className="text-[11px] font-semibold text-indigo-700">{fmtTime(event.start_time)}</div>
      <div className="truncate text-sm font-medium text-slate-800">{event.title}</div>
      {event.location && (
        <div className="truncate text-[11px] text-slate-500">{event.location}</div>
      )}
    </button>
  );
}

export default function WeekDayColumn({ day, events, isToday, onSelect }: Props) {
  return (
    <div className="flex min-h-[18rem] flex-col border-r border-slate-200 last:border-r-0">
      <div
        className={`border-b border-slate-200 px-2 py-2 text-center ${
          isToday ? "bg-indigo-50" : "bg-slate-50"
        }`}
      >
        <div className="text-xs font-medium text-slate-500">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day.getUTCDay()]}
        </div>
        <div
          className={`mx-auto mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${
            isToday ? "bg-indigo-600 text-white" : "text-slate-800"
          }`}
        >
          {day.getUTCDate()}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-1.5">
        {events
          .filter((event) => sameDay(new Date(event.start_time), day))
          .map((event) => (
            <EventCard key={event.id} event={event} onSelect={onSelect} />
          ))}
        {events.filter((event) => sameDay(new Date(event.start_time), day)).length === 0 && (
          <span className="mt-1 text-center text-[11px] text-slate-300">No events</span>
        )}
      </div>
    </div>
  );
}

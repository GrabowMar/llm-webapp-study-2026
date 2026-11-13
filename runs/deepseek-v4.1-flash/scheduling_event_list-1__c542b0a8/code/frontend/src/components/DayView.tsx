import type { EventItem } from "../types";
import { fmtTime } from "../date";

interface Props {
  events: EventItem[];
  onSelect: (event: EventItem) => void;
}

export default function DayView({ events, onSelect }: Props) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      {events.length === 0 ? (
        <p className="py-16 text-center text-sm text-slate-400">No events for this day.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {events.map((event) => (
            <li key={event.id}>
              <button
                type="button"
                onClick={() => onSelect(event)}
                className="flex w-full items-start gap-4 rounded-lg px-2 py-3 text-left transition hover:bg-slate-50"
              >
                <div className="w-24 shrink-0 text-sm font-semibold text-indigo-700">
                  {fmtTime(event.start_time)}
                  <div className="text-xs font-normal text-slate-400">
                    {fmtTime(event.end_time)}
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-slate-900">{event.title}</div>
                  {event.location && (
                    <div className="text-sm text-slate-500">{event.location}</div>
                  )}
                  {event.description && (
                    <div className="mt-0.5 line-clamp-2 text-sm text-slate-500">
                      {event.description}
                    </div>
                  )}
                </div>
                <span className="shrink-0 text-xs text-slate-400">{event.created_by}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

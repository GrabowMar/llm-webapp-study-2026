import type { EventItem } from "../types";
import { fmtTime } from "../date";

interface Props {
  date: Date;
  events: EventItem[];
  isToday: boolean;
  inMonth: boolean;
  onSelect: (event: EventItem) => void;
  onOpenDay: (date: Date) => void;
}

export default function MonthView({ date, events, isToday, inMonth, onSelect, onOpenDay }: Props) {
  return (
    <div
      className={`flex min-h-[7rem] flex-col border-b border-r border-slate-200 p-1.5 ${
        inMonth ? "bg-white" : "bg-slate-50"
      }`}
    >
      <button
        type="button"
        onClick={() => onOpenDay(date)}
        className={`mb-1 flex h-7 w-7 items-center justify-center self-start rounded-full text-xs font-semibold ${
          isToday
            ? "bg-indigo-600 text-white"
            : inMonth
              ? "text-slate-700 hover:bg-slate-100"
              : "text-slate-400 hover:bg-slate-100"
        }`}
        title="Open day view"
      >
        {date.getUTCDate()}
      </button>
      <div className="flex flex-col gap-1 overflow-hidden">
        {events.slice(0, 3).map((event) => (
          <button
            key={event.id}
            type="button"
            onClick={() => onSelect(event)}
            className="truncate rounded bg-indigo-50 px-1.5 py-1 text-left text-xs text-indigo-800 hover:bg-indigo-100"
            title={event.title}
          >
            <span className="font-medium">{fmtTime(event.start_time)}</span> {event.title}
          </button>
        ))}
        {events.length > 3 && (
          <span className="px-1 text-[11px] font-medium text-slate-500">
            +{events.length - 3} more
          </span>
        )}
      </div>
    </div>
  );
}

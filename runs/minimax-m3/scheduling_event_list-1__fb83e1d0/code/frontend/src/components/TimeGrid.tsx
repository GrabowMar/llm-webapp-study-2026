import { dateKey, durationMinutes, isSameDay, minutesOfDay, pad, todayUtc } from "../lib/dates";
import type { CalendarEvent } from "../types";

const HOUR_HEIGHT = 56;
const HOURS = Array.from({ length: 24 }, (_, index) => index);

interface TimeGridProps {
  days: Date[];
  eventsByDay: Map<string, CalendarEvent[]>;
  canCreate: boolean;
  onSelectEvent: (event: CalendarEvent) => void;
  onCreateAt: (day: Date, minutes: number) => void;
}

interface Placement {
  event: CalendarEvent;
  lane: number;
  lanes: number;
}

/** Assign overlapping events to side-by-side lanes so none are hidden. */
function layoutDay(events: CalendarEvent[]): Placement[] {
  const sorted = [...events].sort(
    (a, b) =>
      a.start_time.localeCompare(b.start_time) || a.end_time.localeCompare(b.end_time),
  );
  const placements: Placement[] = [];
  let cluster: CalendarEvent[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    if (cluster.length === 0) return;
    const laneEnds: number[] = [];
    const assignments = cluster.map((event) => {
      const start = new Date(event.start_time).getTime();
      const end = new Date(event.end_time).getTime();
      let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(end);
      } else {
        laneEnds[lane] = end;
      }
      return { event, lane };
    });
    const lanes = laneEnds.length;
    for (const assignment of assignments) {
      placements.push({ ...assignment, lanes });
    }
    cluster = [];
    clusterEnd = -Infinity;
  };

  for (const event of sorted) {
    const start = new Date(event.start_time).getTime();
    if (cluster.length > 0 && start >= clusterEnd) flush();
    cluster.push(event);
    clusterEnd = Math.max(clusterEnd, new Date(event.end_time).getTime());
  }
  flush();

  return placements;
}

const chipPalette = [
  "bg-indigo-500/90 text-white border-indigo-600",
  "bg-emerald-500/90 text-white border-emerald-600",
  "bg-amber-500/90 text-white border-amber-600",
  "bg-rose-500/90 text-white border-rose-600",
  "bg-sky-500/90 text-white border-sky-600",
  "bg-violet-500/90 text-white border-violet-600",
];

export function TimeGrid({
  days,
  eventsByDay,
  canCreate,
  onSelectEvent,
  onCreateAt,
}: TimeGridProps) {
  const today = todayUtc();
  const now = new Date();
  const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const template = `4rem repeat(${days.length}, minmax(0, 1fr))`;

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="min-w-[44rem]">
        <div className="grid border-b border-slate-200 bg-slate-50" style={{ gridTemplateColumns: template }}>
          <div />
          {days.map((day) => {
            const isToday = isSameDay(day, today);
            return (
              <div
                key={dateKey(day)}
                className={`border-l border-slate-200 px-2 py-2 text-center ${
                  isToday ? "bg-indigo-50" : ""
                }`}
              >
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {day.toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "short" })}
                </div>
                <div
                  className={`mx-auto mt-1 flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${
                    isToday ? "bg-indigo-600 text-white" : "text-slate-800"
                  }`}
                >
                  {day.getUTCDate()}
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid" style={{ gridTemplateColumns: template }}>
          <div className="relative" style={{ height: HOUR_HEIGHT * 24 }}>
            {HOURS.map((hour) => (
              <span
                key={hour}
                className="absolute right-2 -translate-y-1/2 text-[11px] tabular-nums text-slate-400"
                style={{ top: hour * HOUR_HEIGHT }}
              >
                {pad(hour)}:00
              </span>
            ))}
          </div>

          {days.map((day) => {
            const key = dateKey(day);
            const events = eventsByDay.get(key) ?? [];
            const placements = layoutDay(events);
            const isToday = isSameDay(day, today);

            return (
              <div
                key={key}
                className={`relative border-l border-slate-200 ${
                  canCreate ? "cursor-crosshair" : ""
                }`}
                style={{ height: HOUR_HEIGHT * 24 }}
                onClick={(clickEvent) => {
                  if (!canCreate) return;
                  const bounds = clickEvent.currentTarget.getBoundingClientRect();
                  const offset = clickEvent.clientY - bounds.top;
                  const minutes = Math.min(23 * 60 + 59, Math.max(0, Math.floor((offset / HOUR_HEIGHT) * 60)));
                  onCreateAt(day, minutes - (minutes % 30));
                }}
              >
                {HOURS.map((hour) => (
                  <div
                    key={hour}
                    className="pointer-events-none absolute inset-x-0 border-t border-slate-100"
                    style={{ top: hour * HOUR_HEIGHT }}
                  />
                ))}

                {isToday ? (
                  <div
                    className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-red-500"
                    style={{ top: (nowMinutes / 60) * HOUR_HEIGHT }}
                  />
                ) : null}

                {placements.map(({ event, lane, lanes }) => {
                  const start = minutesOfDay(event.start_time);
                  const duration = durationMinutes(event.start_time, event.end_time);
                  const top = (start / 60) * HOUR_HEIGHT;
                  const height = Math.max(22, (duration / 60) * HOUR_HEIGHT - 2);
                  const width = 100 / lanes;
                  return (
                    <button
                      key={event.id}
                      type="button"
                      onClick={(clickEvent) => {
                        clickEvent.stopPropagation();
                        onSelectEvent(event);
                      }}
                      title={`${event.title} - ${event.location ?? ""}`}
                      className={`absolute overflow-hidden rounded-md border px-1.5 py-1 text-left text-[11px] font-medium leading-tight shadow-sm transition hover:brightness-95 ${
                        chipPalette[event.id % chipPalette.length]
                      }`}
                      style={{
                        top,
                        height,
                        left: `calc(${lane * width}% + 2px)`,
                        width: `calc(${width}% - 4px)`,
                      }}
                    >
                      <span className="block truncate">{event.title}</span>
                      <span className="block truncate opacity-80">
                        {pad(Math.floor(start / 60))}:{pad(start % 60)}
                        {event.location ? ` - ${event.location}` : ""}
                      </span>
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

import {
  dateKey,
  eventsOnDay,
  formatTime,
  isToday,
  monthGridDays,
  weekDays,
  WEEKDAY_LABELS,
  type ViewMode,
} from "../date";
import type { CalendarEvent } from "../api";

const PALETTE = [
  {
    chip: "border-indigo-200 bg-indigo-50 text-indigo-800 hover:bg-indigo-100",
    block: "border-indigo-500 bg-indigo-100 text-indigo-900 hover:bg-indigo-200",
    dot: "bg-indigo-500",
  },
  {
    chip: "border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100",
    block: "border-sky-500 bg-sky-100 text-sky-900 hover:bg-sky-200",
    dot: "bg-sky-500",
  },
  {
    chip: "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100",
    block: "border-emerald-500 bg-emerald-100 text-emerald-900 hover:bg-emerald-200",
    dot: "bg-emerald-500",
  },
  {
    chip: "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100",
    block: "border-amber-500 bg-amber-100 text-amber-900 hover:bg-amber-200",
    dot: "bg-amber-500",
  },
  {
    chip: "border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100",
    block: "border-rose-500 bg-rose-100 text-rose-900 hover:bg-rose-200",
    dot: "bg-rose-500",
  },
  {
    chip: "border-violet-200 bg-violet-50 text-violet-800 hover:bg-violet-100",
    block: "border-violet-500 bg-violet-100 text-violet-900 hover:bg-violet-200",
    dot: "bg-violet-500",
  },
];

export function colorFor(id: number) {
  return PALETTE[Math.abs(id) % PALETTE.length];
}

interface ViewProps {
  anchor: Date;
  events: CalendarEvent[];
  signedIn: boolean;
  onSelect: (event: CalendarEvent) => void;
  onCreateAt: (date: Date) => void;
  onShowDay: (date: Date) => void;
}

const HOUR_HEIGHT = 52;
const DAY_MS = 86_400_000;

interface Segment {
  event: CalendarEvent;
  top: number;
  height: number;
  column: number;
  columns: number;
}

function daySegments(events: CalendarEvent[], day: Date): Segment[] {
  const dayStart = Date.UTC(
    day.getUTCFullYear(),
    day.getUTCMonth(),
    day.getUTCDate(),
  );
  const dayEnd = dayStart + DAY_MS;
  const segments: Omit<Segment, "column" | "columns">[] = [];

  for (const event of events) {
    const eventStart = new Date(event.start_time).getTime();
    const eventEnd = new Date(event.end_time).getTime();
    const start = Math.max(eventStart, dayStart);
    const end = Math.min(eventEnd, dayEnd);
    if (end <= start) continue;
    const top = ((start - dayStart) / 3_600_000) * HOUR_HEIGHT;
    const height = Math.max(((end - start) / 3_600_000) * HOUR_HEIGHT, 22);
    segments.push({ event, top, height });
  }

  segments.sort((a, b) => a.top - b.top || a.event.id - b.event.id);

  const clusters: (typeof segments)[] = [];
  let current: typeof segments = [];
  let clusterEnd = -Infinity;
  for (const segment of segments) {
    if (current.length && segment.top >= clusterEnd) {
      clusters.push(current);
      current = [];
      clusterEnd = -Infinity;
    }
    current.push(segment);
    clusterEnd = Math.max(clusterEnd, segment.top + segment.height);
  }
  if (current.length) clusters.push(current);

  const laidOut: Segment[] = [];
  for (const cluster of clusters) {
    const columnEnds: number[] = [];
    const placed = cluster.map((segment) => {
      let column = columnEnds.findIndex(
        (end) => end <= segment.top + 0.01,
      );
      if (column === -1) {
        column = columnEnds.length;
        columnEnds.push(0);
      }
      columnEnds[column] = segment.top + segment.height;
      return { ...segment, column };
    });
    const columns = columnEnds.length;
    placed.forEach((segment) => {
      laidOut.push({ ...segment, columns });
    });
  }
  return laidOut;
}

function EventChip({
  event,
  onClick,
  showTime = true,
}: {
  event: CalendarEvent;
  onClick: () => void;
  showTime?: boolean;
}) {
  const color = colorFor(event.id);
  return (
    <button
      type="button"
      onClick={(click) => {
        click.stopPropagation();
        onClick();
      }}
      title={event.title}
      className={`flex w-full items-center gap-1 truncate rounded border-l-2 px-1.5 py-0.5 text-left text-xs font-medium transition ${color.chip}`}
    >
      {showTime && (
        <span className="shrink-0 opacity-70">
          {formatTime(event.start_time)}
        </span>
      )}
      <span className="truncate">{event.title}</span>
    </button>
  );
}

export function MonthView({
  anchor,
  events,
  signedIn,
  onSelect,
  onCreateAt,
  onShowDay,
}: ViewProps) {
  const days = monthGridDays(anchor);
  const currentMonth = anchor.getUTCMonth();

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-500"
          >
            <span className="hidden sm:inline">{label}</span>
            <span className="sm:hidden">{label.charAt(0)}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day, index) => {
          const inMonth = day.getUTCMonth() === currentMonth;
          const dayEvents = eventsOnDay(events, day).sort(
            (a, b) =>
              new Date(a.start_time).getTime() -
              new Date(b.start_time).getTime(),
          );
          const visible = dayEvents.slice(0, 3);
          const extra = dayEvents.length - visible.length;
          return (
            <div
              key={dateKey(day)}
              onClick={() => {
                if (signedIn) onCreateAt(day);
              }}
              className={`min-h-[92px] border-b border-r border-slate-100 p-1.5 sm:min-h-[116px] ${
                inMonth ? "bg-white" : "bg-slate-50/60"
              } ${index % 7 === 6 ? "border-r-0" : ""} ${
                index >= 35 ? "border-b-0" : ""
              } ${signedIn ? "cursor-pointer hover:bg-indigo-50/40" : ""}`}
            >
              <div className="mb-1 flex items-center justify-between">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                    isToday(day)
                      ? "bg-indigo-600 text-white"
                      : inMonth
                        ? "text-slate-700"
                        : "text-slate-400"
                  }`}
                >
                  {day.getUTCDate()}
                </span>
                {signedIn && (
                  <span className="hidden text-slate-300 group-hover:text-indigo-400 sm:inline">
                    +
                  </span>
                )}
              </div>
              <div className="space-y-1">
                {visible.map((event) => (
                  <EventChip
                    key={event.id}
                    event={event}
                    onClick={() => onSelect(event)}
                  />
                ))}
                {extra > 0 && (
                  <button
                    type="button"
                    onClick={(click) => {
                      click.stopPropagation();
                      onShowDay(day);
                    }}
                    className="w-full rounded px-1.5 py-0.5 text-left text-xs font-medium text-indigo-600 hover:bg-indigo-50"
                  >
                    +{extra} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TimeGrid({
  days,
  events,
  signedIn,
  onSelect,
  onCreateAt,
}: Omit<ViewProps, "anchor" | "onShowDay"> & { days: Date[] }) {
  const hours = Array.from({ length: 24 }, (_, index) => index);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="grid border-b border-slate-200 bg-slate-50" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))` }}>
        <div />
        {days.map((day) => (
          <div
            key={dateKey(day)}
            className="border-l border-slate-200 px-2 py-2 text-center"
          >
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {WEEKDAY_LABELS[
                (day.getUTCDay() + 6) % 7
              ]}
            </div>
            <div
              className={`mx-auto mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${
                isToday(day) ? "bg-indigo-600 text-white" : "text-slate-800"
              }`}
            >
              {day.getUTCDate()}
            </div>
          </div>
        ))}
      </div>
      <div className="max-h-[600px] overflow-y-auto">
        <div className="grid" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))` }}>
          <div>
            {hours.map((hour) => (
              <div
                key={hour}
                className="relative border-b border-slate-100 pr-2 text-right text-[11px] text-slate-400"
                style={{ height: HOUR_HEIGHT }}
              >
                <span className="relative -top-2">
                  {String(hour).padStart(2, "0")}:00
                </span>
              </div>
            ))}
          </div>
          {days.map((day) => {
            const segments = daySegments(events, day);
            return (
              <div
                key={dateKey(day)}
                onClick={(click) => {
                  if (!signedIn) return;
                  const rect = click.currentTarget.getBoundingClientRect();
                  const offset = click.clientY - rect.top;
                  const hour = Math.max(
                    0,
                    Math.min(23, Math.floor(offset / HOUR_HEIGHT)),
                  );
                  onCreateAt(new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour)));
                }}
                className={`relative border-l border-slate-100 ${
                  isToday(day) ? "bg-indigo-50/30" : ""
                } ${signedIn ? "cursor-pointer" : ""}`}
                style={{ height: HOUR_HEIGHT * 24 }}
              >
                {hours.map((hour) => (
                  <div
                    key={hour}
                    className="pointer-events-none border-b border-slate-100"
                    style={{ height: HOUR_HEIGHT }}
                  />
                ))}
                {segments.map((segment) => {
                  const color = colorFor(segment.event.id);
                  const width = 100 / segment.columns;
                  return (
                    <button
                      key={`${segment.event.id}-${dateKey(day)}`}
                      type="button"
                      onClick={(click) => {
                        click.stopPropagation();
                        onSelect(segment.event);
                      }}
                      title={segment.event.title}
                      className={`absolute overflow-hidden rounded border-l-4 border-y border-r border-transparent px-1.5 py-0.5 text-left text-xs shadow-sm transition ${color.block}`}
                      style={{
                        top: segment.top + 1,
                        height: Math.max(segment.height - 2, 20),
                        left: `calc(${segment.column * width}% + 2px)`,
                        width: `calc(${width}% - 4px)`,
                        zIndex: 10 + segment.column,
                      }}
                    >
                      <span className="block truncate font-semibold">
                        {segment.event.title}
                      </span>
                      <span className="block truncate opacity-75">
                        {formatTime(segment.event.start_time)}–
                        {formatTime(segment.event.end_time)}
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

export function WeekView(props: ViewProps) {
  const days = weekDays(props.anchor);
  return (
    <TimeGrid
      days={days}
      events={props.events}
      signedIn={props.signedIn}
      onSelect={props.onSelect}
      onCreateAt={props.onCreateAt}
    />
  );
}

export function DayView(props: ViewProps) {
  const day = new Date(
    Date.UTC(
      props.anchor.getUTCFullYear(),
      props.anchor.getUTCMonth(),
      props.anchor.getUTCDate(),
    ),
  );
  return (
    <TimeGrid
      days={[day]}
      events={props.events}
      signedIn={props.signedIn}
      onSelect={props.onSelect}
      onCreateAt={props.onCreateAt}
    />
  );
}

export function viewLabel(mode: ViewMode): string {
  return mode === "month" ? "Month" : mode === "week" ? "Week" : "Day";
}

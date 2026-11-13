import { type Event } from "../api";
import {
  HOUR_PX,
  HOURS,
  WEEKDAYS,
  addDays,
  formatTime,
  isSameDayUTC,
  overlapsDay,
  parseAPI,
  startOfDay,
  startOfWeek,
  todayUTC,
} from "../dates";

interface Positioned {
  event: Event;
  start: Date;
  top: number;
  height: number;
  lane: number;
  lanes: number;
  fromPrevDay: boolean;
  toNextDay: boolean;
}

const EVENT_COLORS = [
  "border-indigo-400 bg-indigo-50 hover:bg-indigo-100",
  "border-emerald-400 bg-emerald-50 hover:bg-emerald-100",
  "border-amber-400 bg-amber-50 hover:bg-amber-100",
  "border-rose-400 bg-rose-50 hover:bg-rose-100",
  "border-sky-400 bg-sky-50 hover:bg-sky-100",
  "border-violet-400 bg-violet-50 hover:bg-violet-100",
];

function colorClass(id: number): string {
  return EVENT_COLORS[id % EVENT_COLORS.length];
}

const DAY_MINUTES = 24 * 60;

function minutesOf(d: Date): number {
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

function layoutDay(dayStart: Date, events: Event[]): Positioned[] {
  const dayEnd = addDays(dayStart, 1);
  const items = events
    .map((event) => ({ event, start: parseAPI(event.start_time), end: parseAPI(event.end_time) }))
    .filter(({ start, end }) => overlapsDay(dayStart, start, end))
    .sort(
      (a, b) =>
        a.start.getTime() - b.start.getTime() ||
        b.end.getTime() - a.end.getTime() ||
        a.event.id - b.event.id,
    );

  const positioned: Positioned[] = [];
  let cluster: typeof items = [];
  let clusterEnd = 0;
  const laneEnds: number[] = [];

  const flush = () => {
    const lanes = laneEnds.length;
    for (const it of cluster) {
      const match = positioned.find((p) => p.event === it.event);
      if (match) match.lanes = lanes;
    }
    cluster = [];
    clusterEnd = 0;
    laneEnds.length = 0;
  };

  for (const it of items) {
    const s = it.start < dayStart ? 0 : Math.max(minutesOf(it.start), 0);
    const continues = it.end > dayEnd;
    const endMin = it.end.getTime() === dayEnd.getTime() ? DAY_MINUTES : minutesOf(it.end);
    const e = continues ? DAY_MINUTES : Math.max(endMin, s + 15);
    if (cluster.length && s >= clusterEnd) flush();
    let lane = laneEnds.findIndex((endAt) => endAt <= s);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(0);
    }
    laneEnds[lane] = Math.max(laneEnds[lane], e);
    clusterEnd = Math.max(clusterEnd, e);
    cluster.push(it);
    positioned.push({
      event: it.event,
      start: it.start,
      top: (s / 60) * HOUR_PX,
      height: Math.max(((e - s) / 60) * HOUR_PX, 22),
      lane,
      lanes: 1,
      fromPrevDay: it.start < dayStart,
      toNextDay: continues,
    });
  }
  flush();
  return positioned;
}

function EventBlock({
  p,
  compact,
  onSelect,
}: {
  p: Positioned;
  compact: boolean;
  onSelect: (event: Event) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(p.event)}
      style={{
        top: p.top,
        height: p.height,
        left: `calc(${(p.lane * 100) / p.lanes}% + 2px)`,
        width: `calc(${100 / p.lanes}% - 4px)`,
      }}
      title={`${p.event.title} · ${formatTime(p.start)} UTC`}
      className={`absolute overflow-hidden rounded border-l-4 px-1.5 py-0.5 text-left text-[11px] leading-tight shadow-sm transition ${colorClass(
        p.event.id,
      )}`}
    >
      <span className="block truncate font-semibold text-slate-800">
        {p.fromPrevDay ? "← " : ""}
        {p.event.title}
      </span>
      {!compact && (
        <span className="block truncate text-slate-500">
          {formatTime(p.start)}
          {p.toNextDay ? " →" : ""}
        </span>
      )}
    </button>
  );
}

function TimeGutter() {
  return (
    <div className="w-12 shrink-0 select-none">
      {HOURS.map((h) => (
        <div
          key={h}
          style={{ height: HOUR_PX }}
          className="relative border-b border-transparent"
        >
          <span className="absolute -top-2 right-1.5 text-[10px] text-slate-400">
            {h.toString().padStart(2, "0")}:00
          </span>
        </div>
      ))}
    </div>
  );
}

function DayColumn({
  day,
  events,
  compact,
  onSelect,
  onCreateAt,
}: {
  day: Date;
  events: Event[];
  compact: boolean;
  onSelect: (event: Event) => void;
  onCreateAt: (start: Date, end: Date) => void;
}) {
  const positioned = layoutDay(day, events);
  const isToday = isSameDayUTC(day, todayUTC());

  return (
    <div
      className="relative min-w-0 flex-1 border-l border-slate-200"
      onClick={(e) => {
        if (e.target !== e.currentTarget) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const minutes = Math.floor(((e.clientY - rect.top) / HOUR_PX) * 60 / 30) * 30;
        const clamped = Math.min(Math.max(minutes, 0), DAY_MINUTES - 60);
        const start = new Date(day.getTime() + clamped * 60_000);
        onCreateAt(start, new Date(start.getTime() + 60 * 60_000));
      }}
    >
      <div className="pointer-events-none absolute inset-0">
        {HOURS.map((h) => (
          <div key={h} style={{ height: HOUR_PX }} className="border-b border-slate-100" />
        ))}
      </div>
      {positioned.map((p) => (
        <EventBlock key={p.event.id} p={p} compact={compact} onSelect={onSelect} />
      ))}
      {isToday && <NowLine />}
    </div>
  );
}

function NowLine() {
  const now = new Date();
  const top = ((now.getUTCHours() * 60 + now.getUTCMinutes()) / 60) * HOUR_PX;
  return (
    <div className="pointer-events-none absolute inset-x-0 z-10" style={{ top }}>
      <div className="relative">
        <div className="h-0.5 bg-red-500" />
        <div className="absolute -left-1 -top-[3px] h-2 w-2 rounded-full bg-red-500" />
      </div>
    </div>
  );
}

export function TimeGrid({
  days,
  events,
  compact = false,
  onSelect,
  onCreateAt,
}: {
  days: Date[];
  events: Event[];
  compact?: boolean;
  onSelect: (event: Event) => void;
  onCreateAt: (start: Date, end: Date) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="min-w-[560px]">
        <WeekHeaderRow days={days} />
        <div className="flex">
          <TimeGutter />
          {days.map((day) => (
            <DayColumn
              key={day.getTime()}
              day={startOfDay(day)}
              events={events}
              compact={compact}
              onSelect={onSelect}
              onCreateAt={onCreateAt}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function WeekHeaderRow({ days }: { days: Date[] }) {
  const isToday = todayUTC();
  return (
    <div className="mb-1 flex border-b border-slate-200 pl-12">
      {days.map((day) => {
        const today = isSameDayUTC(day, isToday);
        return (
          <div
            key={day.getTime()}
            className={`min-w-0 flex-1 border-l border-transparent px-1 pb-1 text-center text-xs ${
              today ? "font-bold text-indigo-600" : "font-medium text-slate-600"
            }`}
          >
            <span className="block truncate">{WEEKDAYS[(day.getUTCDay() + 6) % 7]}</span>
            <span className="block truncate font-normal text-slate-400">
              {day.getUTCDate()}/{day.getUTCMonth() + 1}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function weekDays(anchor: Date): Date[] {
  const monday = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export { TimeGrid as default };

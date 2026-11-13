import type { CalendarEvent } from "../api";
import { addDays, startOfDay } from "../dates";

export interface DaySegment {
  event: CalendarEvent;
  start: Date;
  end: Date;
  column: number;
  columns: number;
}

export function eventsOnDay(events: CalendarEvent[], day: Date): CalendarEvent[] {
  const dayStart = startOfDay(day).getTime();
  const dayEnd = addDays(startOfDay(day), 1).getTime();
  return events.filter((e) => {
    const s = new Date(e.start_time).getTime();
    const en = new Date(e.end_time).getTime();
    return s < dayEnd && (en > dayStart || (en === s && s >= dayStart));
  });
}

export function spansMultipleDays(event: CalendarEvent): boolean {
  const s = new Date(event.start_time);
  const e = new Date(event.end_time);
  const endDay = startOfDay(new Date(e.getTime() - 1));
  return endDay.getTime() > startOfDay(s).getTime();
}

export function layoutDay(events: CalendarEvent[], day: Date): DaySegment[] {
  const dayStart = startOfDay(day);
  const dayEnd = addDays(dayStart, 1);
  const segments = events
    .map((event) => {
      const s = new Date(event.start_time);
      const e = new Date(event.end_time);
      return {
        event,
        start: s < dayStart ? dayStart : s,
        end: e > dayEnd ? dayEnd : e,
        column: 0,
        columns: 1,
      };
    })
    .sort((a, b) => a.start.getTime() - b.start.getTime() || b.end.getTime() - a.end.getTime());

  const minVisualMs = 20 * 60 * 1000;
  const visualEnd = (seg: DaySegment) => Math.max(seg.end.getTime(), seg.start.getTime() + minVisualMs);

  let cluster: DaySegment[] = [];
  let colEnds: number[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    for (const seg of cluster) seg.columns = colEnds.length;
    cluster = [];
    colEnds = [];
  };

  for (const seg of segments) {
    if (seg.start.getTime() >= clusterEnd) {
      flush();
      clusterEnd = -Infinity;
    }
    let col = colEnds.findIndex((end) => end <= seg.start.getTime());
    if (col === -1) {
      col = colEnds.length;
      colEnds.push(visualEnd(seg));
    } else {
      colEnds[col] = visualEnd(seg);
    }
    seg.column = col;
    cluster.push(seg);
    clusterEnd = Math.max(clusterEnd, visualEnd(seg));
  }
  flush();
  return segments;
}

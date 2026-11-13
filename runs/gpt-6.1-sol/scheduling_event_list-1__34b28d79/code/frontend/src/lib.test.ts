import assert from "node:assert/strict";
import test from "node:test";
import { addDays, changeMonth, dateKey, daysForView, eventsOnDay, monthDays, periodTitle, timeSegments, weekStart } from "./lib.ts";
import type { CalendarEvent } from "./lib.ts";

const event = (id: number, start: string, end: string): CalendarEvent => ({ id, title: `Event ${id}`, description: null, location: null, start_time: start, end_time: end, created_at: "2026-11-01T00:00:00Z", created_by: "alice" });

test("month grids start on Monday and contain the entire month", () => {
  const days = monthDays(new Date("2026-11-10T00:00:00Z"));
  assert.equal(dateKey(days[0]), "2026-10-26");
  assert.equal(dateKey(days[days.length - 1]), "2026-12-06");
  assert.equal(days.length, 42);
  assert.equal(days[0].getUTCDay(), 1);
});

test("month navigation clamps dates and handles leap years", () => {
  assert.equal(dateKey(changeMonth(new Date("2026-01-31T00:00:00Z"), 1)), "2026-02-28");
  assert.equal(dateKey(changeMonth(new Date("2024-01-31T00:00:00Z"), 1)), "2024-02-29");
  assert.equal(dateKey(changeMonth(new Date("2026-01-01T00:00:00Z"), -1)), "2025-12-01");
});

test("week and day views use UTC boundaries", () => {
  const date = new Date("2026-11-15T23:30:00Z");
  assert.equal(dateKey(weekStart(date)), "2026-11-09");
  assert.equal(daysForView(date, "week").length, 7);
  assert.equal(daysForView(date, "day")[0].toISOString(), "2026-11-15T00:00:00.000Z");
  assert.equal(dateKey(addDays(new Date("2026-12-31T00:00:00Z"), 1)), "2027-01-01");
});

test("multi-day events appear on each overlapping day but not their midnight end date", () => {
  const events = [event(1, "2026-11-10T23:00:00Z", "2026-11-12T00:00:00Z")];
  assert.equal(eventsOnDay(events, new Date("2026-11-10")).length, 1);
  assert.equal(eventsOnDay(events, new Date("2026-11-11")).length, 1);
  assert.equal(eventsOnDay(events, new Date("2026-11-12")).length, 0);
});

test("overlapping events get separate timeline columns", () => {
  const segments = timeSegments([
    event(1, "2026-11-10T09:00:00Z", "2026-11-10T11:00:00Z"),
    event(2, "2026-11-10T10:00:00Z", "2026-11-10T12:00:00Z"),
    event(3, "2026-11-10T14:00:00Z", "2026-11-10T15:00:00Z"),
  ], new Date("2026-11-10"));
  assert.equal(segments[0].columns, 2);
  assert.equal(segments[1].columns, 2);
  assert.notEqual(segments[0].column, segments[1].column);
  assert.equal(segments[2].columns, 1);
  assert.equal(segments[2].start, 840);
});

test("period titles include both years when a week crosses a year boundary", () => {
  const title = periodTitle(new Date("2026-12-31"), "week");
  assert.match(title, /2026/);
  assert.match(title, /2027/);
});

import { renderToString } from "react-dom/server";

(globalThis as Record<string, unknown>).localStorage = {
  getItem: () => null,
  setItem() {},
  removeItem() {},
};

import App from "./App";
import AuthModal from "./components/AuthModal";
import CalendarView from "./components/CalendarView";
import ConfirmDialog from "./components/ConfirmDialog";
import EventDetailsModal from "./components/EventDetailsModal";
import EventFormModal from "./components/EventFormModal";

const sampleEvent = {
  id: 1,
  title: "Team standup",
  description: "Daily sync",
  location: "Room 4",
  start_time: "2026-11-12T09:00:00Z",
  end_time: "2026-11-12T09:30:00Z",
  created_at: "2026-11-01T12:00:00Z",
  created_by: "alice",
};

const anchor = new Date(Date.UTC(2026, 10, 12));
const renders: Record<string, string> = {
  App: renderToString(<App />),
  AuthModal: renderToString(
    <AuthModal initialMode="signin" onClose={() => {}} onSignedIn={() => {}} />,
  ),
  EventFormCreate: renderToString(
    <EventFormModal
      mode="create"
      defaultStart={anchor}
      onClose={() => {}}
      onSaved={() => {}}
    />,
  ),
  EventFormEdit: renderToString(
    <EventFormModal
      mode="edit"
      event={sampleEvent}
      onClose={() => {}}
      onSaved={() => {}}
    />,
  ),
  EventDetails: renderToString(
    <EventDetailsModal
      event={sampleEvent}
      canEdit
      onEdit={() => {}}
      onDelete={() => {}}
      onClose={() => {}}
    />,
  ),
  ConfirmDialog: renderToString(
    <ConfirmDialog
      title="Delete event"
      message="Sure?"
      confirmLabel="Delete"
      onConfirm={() => {}}
      onCancel={() => {}}
    />,
  ),
  MonthView: renderToString(
    <CalendarView
      view="month"
      anchor={anchor}
      events={[sampleEvent]}
      onSelectEvent={() => {}}
      onSelectDay={() => {}}
    />,
  ),
  WeekView: renderToString(
    <CalendarView
      view="week"
      anchor={anchor}
      events={[sampleEvent]}
      onSelectEvent={() => {}}
      onSelectDay={() => {}}
    />,
  ),
  DayView: renderToString(
    <CalendarView
      view="day"
      anchor={anchor}
      events={[sampleEvent]}
      onSelectEvent={() => {}}
      onSelectDay={() => {}}
    />,
  ),
};

const expectations: Record<string, string> = {
  App: "Event Calendar",
  AuthModal: "Sign in",
  EventFormCreate: "New event",
  EventFormEdit: "Edit event",
  EventDetails: "Team standup",
  ConfirmDialog: "Delete event",
  MonthView: "Team standup",
  WeekView: "Team standup",
  DayView: "Team standup",
};

let failed = false;
for (const [name, html] of Object.entries(renders)) {
  const needle = expectations[name];
  const ok = html.includes(needle);
  console.log(`${ok ? "ok  " : "FAIL"} ${name} (${html.length} bytes)`);
  if (!ok) {
    failed = true;
    console.log(`  missing: ${needle}`);
  }
}

if (failed) {
  process.exit(1);
}
console.log("SSR smoke passed");

import { renderToString } from "react-dom/server";
import AdminPanel from "./src/components/AdminPanel";
import AvailabilityPanel from "./src/components/AvailabilityPanel";
import BookingForm from "./src/components/BookingForm";
import MyReservations from "./src/components/MyReservations";
import App from "./src/App";
import type { Reservation, Slot } from "./src/types";

function render(label: string, storage: Record<string, string>): string {
  const store = new Map(Object.entries(storage));
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  };
  const html = renderToString(<App />);
  if (html.length < 500) {
    throw new Error(`${label}: suspiciously short render (${html.length} chars)`);
  }
  console.log(`${label}: ok (${html.length} chars)`);
  return html;
}

function expect(haystack: string, needle: string, label: string): void {
  if (!haystack.includes(needle)) {
    throw new Error(`${label}: missing "${needle}"`);
  }
}

function forbid(haystack: string, needle: string, label: string): void {
  if (haystack.includes(needle)) {
    throw new Error(`${label}: must not contain "${needle}"`);
  }
}

const anon = render("anonymous", {});
expect(anon, "Sign in to book a table", "anonymous");
expect(anon, "Availability", "anonymous");
expect(anon, "Loading slots", "anonymous");
forbid(anon, "Book this slot", "anonymous");
forbid(anon, "Book a table", "anonymous");

const user = render("user", {
  "reservations.token": "tok",
  "reservations.username": "bob",
});
expect(user, "Signed in as", "user");
expect(user, "Book a table", "user");
expect(user, "My reservations", "user");
expect(user, "Table reservations", "user");
forbid(user, ">Admin<", "user");

const admin = render("admin", {
  "reservations.token": "tok",
  "reservations.username": "admin",
});
expect(admin, "Signed in as", "admin");
expect(admin, ">Admin<", "admin");

const slots: Slot[] = [
  { time: "18:00", booked: 5, remaining: 15 },
  { time: "19:00", booked: 20, remaining: 0 },
];
const panelAnon = renderToString(
  <AvailabilityPanel
    date="2026-12-05"
    slots={slots}
    loading={false}
    error={null}
    signedIn={false}
    onDateChange={() => {}}
    onBook={() => {}}
  />,
);
expect(panelAnon, "Sign in to book this slot", "panel-anon");
forbid(panelAnon, "Book this slot", "panel-anon");
expect(panelAnon, "0 remaining", "panel-anon");

const panelUser = renderToString(
  <AvailabilityPanel
    date="2026-12-05"
    slots={slots}
    loading={false}
    error={null}
    signedIn
    onDateChange={() => {}}
    onBook={() => {}}
  />,
);
expect(panelUser, "Book this slot", "panel-user");
expect(panelUser, "5 of 20 booked", "panel-user");

const form = renderToString(
  <BookingForm
    editing={null}
    seed={{ date: "2026-12-05", time: "18:00", nonce: 1 }}
    slots={slots}
    day="2026-12-05"
    onSaved={() => {}}
    onCancelEdit={() => {}}
  />,
);
expect(form, "Book a table", "form");
expect(form, "15 of 20 seats remaining", "form");

const reservation: Reservation = {
  id: 7,
  name: "Alice Example",
  email: "alice@example.com",
  date: "2026-12-05",
  time: "19:00",
  party_size: 3,
  notes: "Window seat",
  created_at: "2026-11-10T15:21:49+00:00",
};
const mine = renderToString(
  <MyReservations
    reservations={[reservation]}
    loading={false}
    error={null}
    onEdit={() => {}}
    onRefresh={() => {}}
    onUnauthorized={() => {}}
  />,
);
expect(mine, "Alice Example", "mine");
expect(mine, "Window seat", "mine");
expect(mine, "Reservation #7", "mine");
expect(mine, "1 upcoming booking(s)", "mine");

const adminPanel = renderToString(
  <AdminPanel date="2026-12-05" onDateChange={() => {}} onUnauthorized={() => {}} />,
);
expect(adminPanel, "All reservations", "admin-panel");

console.log("SMOKE OK");

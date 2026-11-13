import { useCallback, useEffect, useState } from "react";
import { api, ApiError, clearSession, getStoredUsername, getToken } from "./api";
import AdminPanel from "./components/AdminPanel";
import AuthPanel from "./components/AuthPanel";
import AvailabilityPanel from "./components/AvailabilityPanel";
import BookingForm from "./components/BookingForm";
import MyReservations from "./components/MyReservations";
import type { AvailabilityList, Reservation, ReservationList, Slot } from "./types";
import { secondaryButton, smallMuted, todayISO } from "./ui";

type Tab = "availability" | "book" | "reservations" | "admin";

interface Session {
  username: string;
}

function initialSession(): Session | null {
  const token = getToken();
  const username = getStoredUsername();
  return token && username ? { username } : null;
}

const activeTabClass =
  "rounded-lg bg-white px-4 py-2 text-sm font-medium text-indigo-700 shadow-sm ring-1 ring-slate-200";
const inactiveTabClass =
  "rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-white hover:text-slate-900 hover:shadow-sm";

export default function App() {
  const [session, setSession] = useState<Session | null>(initialSession);
  const [tab, setTab] = useState<Tab>("availability");
  const [date, setDate] = useState(todayISO);
  const [seed, setSeed] = useState(() => ({ date, time: "", nonce: 0 }));
  const [editing, setEditing] = useState<Reservation | null>(null);

  const [slots, setSlots] = useState<Slot[]>([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(true);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);

  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [reservationsLoading, setReservationsLoading] = useState(false);
  const [reservationsError, setReservationsError] = useState<string | null>(null);

  const signOut = useCallback(() => {
    clearSession();
    setSession(null);
    setReservations([]);
    setReservationsError(null);
    setEditing(null);
    setTab("availability");
  }, []);

  const refreshAvailability = useCallback(async () => {
    setAvailabilityLoading(true);
    try {
      const result = await api<AvailabilityList>(
        `/api/availability?date=${encodeURIComponent(date)}`,
      );
      setSlots(result.items);
      setAvailabilityError(null);
    } catch (cause) {
      setAvailabilityError(
        cause instanceof ApiError ? cause.message : "Could not load availability",
      );
    } finally {
      setAvailabilityLoading(false);
    }
  }, [date]);

  const refreshReservations = useCallback(async () => {
    if (!session) {
      setReservations([]);
      return;
    }
    setReservationsLoading(true);
    try {
      const result = await api<ReservationList>("/api/reservations");
      setReservations(result.items);
      setReservationsError(null);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        signOut();
        return;
      }
      setReservationsError(
        cause instanceof ApiError ? cause.message : "Could not load reservations",
      );
    } finally {
      setReservationsLoading(false);
    }
  }, [session, signOut]);

  useEffect(() => {
    void refreshAvailability();
  }, [refreshAvailability]);

  useEffect(() => {
    void refreshReservations();
  }, [refreshReservations]);

  function handleSaved() {
    void refreshAvailability();
    void refreshReservations();
  }

  function changeDate(next: string) {
    setDate(next);
    setSeed((previous) => ({ ...previous, date: next }));
  }

  function handleBook(slot: Slot) {
    setSeed((previous) => ({ date, time: slot.time, nonce: previous.nonce + 1 }));
    setEditing(null);
    setTab("book");
  }

  function handleEdit(reservation: Reservation) {
    setEditing(reservation);
    setTab("book");
  }

  function handleSignedIn(username: string) {
    setSession({ username });
    setTab("availability");
  }

  const isAdmin = session?.username === "admin";
  const activeTab: Tab = session ? tab : "availability";
  const tabs: { id: Tab; label: string }[] = [{ id: "availability", label: "Availability" }];
  if (session) {
    tabs.push({ id: "book", label: "Book a table" });
    tabs.push({ id: "reservations", label: "My reservations" });
  }
  if (isAdmin) {
    tabs.push({ id: "admin", label: "Admin" });
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-baseline gap-3">
            <h1 className="text-lg font-semibold tracking-tight">Table reservations</h1>
            <span className="hidden text-xs text-slate-400 sm:inline">
              20 seats per time slot
            </span>
          </div>
          {session ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-600">
                Signed in as{" "}
                <span className="font-semibold text-slate-900">{session.username}</span>
              </span>
              <button className={secondaryButton} type="button" onClick={signOut}>
                Sign out
              </button>
            </div>
          ) : (
            <span className={smallMuted}>Sign in to book a table</span>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        {!session && <AuthPanel onSignedIn={handleSignedIn} />}

        <div className="space-y-6">
          {session && (
            <nav className="flex flex-wrap gap-2" aria-label="Sections">
              {tabs.map((item) => (
                <button
                  aria-current={item.id === activeTab ? "page" : undefined}
                  className={item.id === activeTab ? activeTabClass : inactiveTabClass}
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </nav>
          )}

          {activeTab === "availability" && (
            <AvailabilityPanel
              date={date}
              slots={slots}
              loading={availabilityLoading}
              error={availabilityError}
              signedIn={session !== null}
              onDateChange={changeDate}
              onBook={handleBook}
            />
          )}

          {session && activeTab === "book" && (
            <BookingForm
              editing={editing}
              seed={seed}
              slots={slots}
              day={date}
              onSaved={handleSaved}
              onCancelEdit={() => setEditing(null)}
              onUnauthorized={signOut}
            />
          )}

          {session && activeTab === "reservations" && (
            <MyReservations
              reservations={reservations}
              loading={reservationsLoading}
              error={reservationsError}
              onEdit={handleEdit}
              onRefresh={() => void refreshReservations()}
              onUnauthorized={signOut}
            />
          )}

          {session && isAdmin && activeTab === "admin" && (
            <AdminPanel date={date} onDateChange={changeDate} onUnauthorized={signOut} />
          )}
        </div>
      </main>

      <footer className="mx-auto max-w-5xl px-4 pb-8">
        <p className={smallMuted}>
          Anyone can browse a day's availability. Sign in to book, change or cancel your
          reservations.
        </p>
      </footer>
    </div>
  );
}

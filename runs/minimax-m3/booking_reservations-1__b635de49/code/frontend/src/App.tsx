import { useCallback, useEffect, useState } from "react";
import {
  fetchAllAdminReservations,
  fetchAvailability,
  fetchMe,
  fetchReservations,
  getStoredToken,
  logout as apiLogout,
  storeToken,
} from "./api";
import type { AvailabilityItem, Reservation, User } from "./api";
import AdminPanel from "./components/AdminPanel";
import AuthPanel, { AuthHeader } from "./components/AuthPanel";
import AvailabilityPanel from "./components/AvailabilityPanel";
import BookingForm from "./components/BookingForm";
import ReservationsPanel from "./components/ReservationsPanel";
import { todayISO } from "./ui";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(true);
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [availability, setAvailability] = useState<AvailabilityItem[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [adminReservations, setAdminReservations] = useState<Reservation[]>([]);
  const [adminTotal, setAdminTotal] = useState(0);
  const [editing, setEditing] = useState<Reservation | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function restore() {
      if (!getStoredToken()) {
        setBooting(false);
        return;
      }
      try {
        const me = await fetchMe();
        if (!cancelled) setUser(me);
      } catch {
        storeToken(null);
      } finally {
        if (!cancelled) setBooting(false);
      }
    }
    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadAvailability = useCallback(async (date: string) => {
    try {
      const data = await fetchAvailability(date);
      setAvailability(data.items);
    } catch {
      setAvailability([]);
    }
  }, []);

  const loadReservations = useCallback(async () => {
    try {
      const data = await fetchReservations();
      setReservations(data.items);
    } catch {
      setReservations([]);
    }
  }, []);

  const loadAdminReservations = useCallback(async (date: string) => {
    try {
      const items = await fetchAllAdminReservations(date);
      setAdminReservations(items);
      setAdminTotal(items.length);
    } catch {
      setAdminReservations([]);
      setAdminTotal(0);
    }
  }, []);

  const refresh = useCallback(async () => {
    await Promise.all([loadAvailability(selectedDate), loadReservations(), loadAdminReservations(selectedDate)]);
  }, [selectedDate, loadAvailability, loadReservations, loadAdminReservations]);

  useEffect(() => {
    void loadAvailability(selectedDate);
  }, [selectedDate, loadAvailability]);

  useEffect(() => {
    if (!user) {
      setReservations([]);
      setAdminReservations([]);
      setAdminTotal(0);
      return;
    }
    void loadReservations();
    void loadAdminReservations(selectedDate);
  }, [user, selectedDate, loadReservations, loadAdminReservations]);

  function handleSignedIn(token: string) {
    storeToken(token);
    fetchMe()
      .then(setUser)
      .catch(() => {
        storeToken(null);
        setUser(null);
      });
    setEditing(null);
  }

  async function handleSignOut() {
    await apiLogout();
    storeToken(null);
    setUser(null);
    setEditing(null);
    setReservations([]);
    setAdminReservations([]);
  }

  function handleDateChange(date: string) {
    setSelectedDate(date);
  }

  if (booting) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50 text-sm text-stone-500">
        Loading…
      </div>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-stone-50 px-4 py-10">
        <AuthPanel onSignedIn={handleSignedIn} />
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <AuthHeader username={user.username} isAdmin={user.is_admin} onSignOut={handleSignOut} />

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <div className="grid gap-6 lg:grid-cols-2">          <div className="space-y-6">
            <AvailabilityPanel
              date={selectedDate}
              availability={availability}
              onDateChange={handleDateChange}
            />
            <BookingForm
              selectedDate={selectedDate}
              editing={editing}
              onStartEdit={setEditing}
              onChanged={() => void refresh()}
            />
          </div>

          <div className="space-y-6">
            <ReservationsPanel
              reservations={reservations}
              onEdit={(reservation) => {
                setEditing(reservation);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              onChanged={() => void refresh()}
            />
            {user.is_admin ? (
              <AdminPanel date={selectedDate} reservations={adminReservations} total={adminTotal} />
            ) : null}
          </div>
        </div>

        <p className="pt-2 text-center text-xs text-stone-400">
          A slot seats at most 20 guests. Availability is public — sign in to book or change a table.
        </p>
      </main>
    </div>
  );
}

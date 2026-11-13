import { useCallback, useEffect, useState } from "react";
import {
  clearSession,
  fetchAvailability,
  getSavedUsername,
  getToken,
  listReservations,
} from "./api";
import type { Reservation, SlotAvailability } from "./types";
import { todayISO } from "./dates";
import AdminPanel from "./components/AdminPanel";
import AuthPanel from "./components/AuthPanel";
import AvailabilityPanel from "./components/AvailabilityPanel";
import BookingForm from "./components/BookingForm";
import MyReservations from "./components/MyReservations";

export default function App() {
  const [username, setUsername] = useState<string | null>(() =>
    getToken() ? getSavedUsername() : null,
  );
  const [date, setDate] = useState(todayISO());
  const [availability, setAvailability] = useState<SlotAvailability[]>([]);
  const [mine, setMine] = useState<Reservation[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const signedIn = username !== null;
  const isAdmin = username === "admin";

  const refresh = useCallback(() => {
    setRefreshKey((key) => key + 1);
  }, []);

  useEffect(() => {
    const handler = () => setUsername(null);
    window.addEventListener("auth:signout", handler);
    return () => window.removeEventListener("auth:signout", handler);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchAvailability(date)
      .then((res) => {
        if (!cancelled) setAvailability(res.items);
      })
      .catch(() => {
        if (!cancelled) setAvailability([]);
      });
    return () => {
      cancelled = true;
    };
  }, [date, refreshKey, signedIn]);

  useEffect(() => {
    if (!signedIn) {
      setMine([]);
      return;
    }
    let cancelled = false;
    listReservations()
      .then((res) => {
        if (!cancelled) setMine(res.items);
      })
      .catch(() => {
        if (!cancelled) setMine([]);
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn, refreshKey]);

  function signOut() {
    clearSession();
    setUsername(null);
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-slate-900 text-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 p-4">
          <h1 className="text-xl font-semibold">Table Reservations</h1>
          {username ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-300">
                Signed in as{" "}
                <span className="font-medium text-white">{username}</span>
              </span>
              <button
                type="button"
                onClick={signOut}
                className="rounded-md border border-slate-600 px-3 py-1.5 text-sm hover:bg-slate-800"
              >
                Sign out
              </button>
            </div>
          ) : (
            <span className="text-sm text-slate-300">Not signed in</span>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 p-4">
        <div className="grid gap-6 lg:grid-cols-2">
          <AvailabilityPanel
            date={date}
            onDateChange={setDate}
            items={availability}
          />
          {signedIn ? (
            <BookingForm date={date} onDateChange={setDate} onBooked={refresh} />
          ) : (
            <AuthPanel onSignedIn={(name) => { setUsername(name); refresh(); }} />
          )}
        </div>

        {signedIn ? (
          <MyReservations items={mine} onChanged={refresh} />
        ) : null}

        {isAdmin ? (
          <AdminPanel date={date} availability={availability} />
        ) : null}
      </main>
    </div>
  );
}

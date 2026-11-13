import { useCallback, useEffect, useState } from "react";
import {
  api,
  ApiError,
  setAuthToken,
  setUnauthorizedHandler,
  todayISO,
  type Reservation,
  type Session,
} from "./api";
import { AdminPanel } from "./AdminPanel";
import { AuthPanel } from "./AuthPanel";
import { AvailabilityPanel } from "./AvailabilityPanel";
import { MyReservations } from "./MyReservations";
import { emptyForm, ReservationForm } from "./ReservationForm";
import { Card, secondaryButton } from "./ui";

const STORAGE_KEY = "table-reservations.session";

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    return s && typeof s.token === "string" && typeof s.username === "string" ? s : null;
  } catch {
    return null;
  }
}

export default function App() {
  const [session, setSession] = useState<Session | null>(() => {
    const s = loadSession();
    setAuthToken(s?.token ?? null);
    return s;
  });
  const [date, setDate] = useState(todayISO());
  const [pickedTime, setPickedTime] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [resLoading, setResLoading] = useState(false);
  const [resError, setResError] = useState<string | null>(null);

  const signOutLocal = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setAuthToken(null);
    setSession(null);
    setReservations([]);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(signOutLocal);
    return () => setUnauthorizedHandler(null);
  }, [signOutLocal]);

  useEffect(() => {
    if (!session) return;
    api
      .me()
      .then((me) => {
        if (me.username !== session.username || me.is_admin !== session.is_admin) {
          const next = { ...session, username: me.username, is_admin: me.is_admin };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
          setSession(next);
        }
      })
      .catch(() => undefined);
  }, [session?.token]);

  const loadReservations = useCallback(async () => {
    if (!session) return;
    setResLoading(true);
    setResError(null);
    try {
      const res = await api.myReservations();
      setReservations(res.items);
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) {
        setResError(err instanceof ApiError ? err.message : "Could not load your reservations");
      }
    } finally {
      setResLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void loadReservations();
  }, [loadReservations, refreshKey]);

  const refresh = () => setRefreshKey((k) => k + 1);

  function signedIn(s: Session) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    setAuthToken(s.token);
    setSession(s);
  }

  async function signOut() {
    try {
      await api.logout();
    } catch {
      /* ignore */
    }
    signOutLocal();
  }

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <h1 className="text-xl font-bold tracking-tight text-stone-900">
            <span className="text-amber-600">●</span> Table reservations
          </h1>
          {session && (
            <div className="flex items-center gap-3 text-sm">
              <span className="text-stone-600">
                Signed in as <strong className="text-stone-900" data-testid="current-user">{session.username}</strong>
                {session.is_admin && (
                  <span className="ml-2 rounded-full bg-stone-800 px-2 py-0.5 text-xs font-medium text-white">admin</span>
                )}
              </span>
              <button type="button" className={secondaryButton} onClick={() => void signOut()}>
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 py-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-1">
          <AvailabilityPanel
            date={date}
            onDateChange={(d) => {
              setDate(d);
              setPickedTime("");
            }}
            refreshKey={refreshKey}
            onPickTime={session ? setPickedTime : undefined}
          />
          {!session && <AuthPanel onSignedIn={signedIn} />}
        </div>

        <div className="flex flex-col gap-6 lg:col-span-2">
          {session ? (
            <>
              <Card title="Book a table">
                <ReservationForm
                  idPrefix="book"
                  initial={emptyForm(date, pickedTime)}
                  submitLabel="Book table"
                  successMessage="Your table is booked."
                  resetOnSuccess={(v) => ({ ...emptyForm(v.date, v.time), name: v.name, email: v.email })}
                  onSubmit={async (input) => {
                    try {
                      await api.createReservation(input);
                      if (input.date && input.date !== date) setDate(input.date);
                    } finally {
                      refresh();
                    }
                  }}
                />
              </Card>
              <MyReservations
                reservations={reservations}
                loading={resLoading}
                error={resError}
                onChanged={refresh}
              />
              {session.is_admin && <AdminPanel date={date} refreshKey={refreshKey} />}
            </>
          ) : (
            <Card title="Welcome">
              <p className="text-sm text-stone-600">
                Pick a day to see how full each time slot is. Sign in or create an account to book, change or cancel
                your reservations.
              </p>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}

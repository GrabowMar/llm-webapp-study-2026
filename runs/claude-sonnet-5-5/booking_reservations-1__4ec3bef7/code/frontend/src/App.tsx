import { useCallback, useEffect, useState } from "react";
import { api, getToken, setToken, setUnauthorizedHandler } from "./api";
import AdminDay from "./AdminDay";
import AuthForms from "./AuthForms";
import DayPicker from "./DayPicker";
import MyReservations from "./MyReservations";
import ReservationForm from "./ReservationForm";
import { Card, secondaryBtn } from "./ui";

type Me = { username: string; is_admin: boolean };

const today = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(!!getToken());
  const [date, setDate] = useState(today());
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const signOutLocally = useCallback(() => {
    setToken(null);
    setMe(null);
  }, []);

  const loadMe = useCallback(async () => {
    if (!getToken()) {
      setMe(null);
      setLoading(false);
      return;
    }
    try {
      setMe(await api.me());
    } catch {
      signOutLocally();
    } finally {
      setLoading(false);
    }
  }, [signOutLocally]);

  useEffect(() => {
    setUnauthorizedHandler(signOutLocally);
    loadMe();
  }, [loadMe, signOutLocally]);

  async function signOut() {
    try {
      await api.logout();
    } catch {
      // the local token is dropped regardless
    }
    signOutLocally();
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <h1 className="text-xl font-bold text-slate-900">Table reservations</h1>
          {me && (
            <div className="flex items-center gap-3 text-sm">
              <span>
                Signed in as <strong data-testid="username">{me.username}</strong>
              </span>
              <button className={secondaryBtn} onClick={signOut}>
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-6">
        {loading ? (
          <p className="text-sm text-slate-600">Loading…</p>
        ) : !me ? (
          <AuthForms onSignedIn={loadMe} />
        ) : me.is_admin ? (
          <>
            <DayPicker date={date} onDate={setDate} refreshKey={refreshKey} />
            <AdminDay date={date} refreshKey={refreshKey} />
          </>
        ) : (
          <>
            <DayPicker date={date} onDate={setDate} refreshKey={refreshKey} />
            <Card title="Book a table">
              <ReservationForm defaultDate={date} onSaved={refresh} />
            </Card>
            <MyReservations refreshKey={refreshKey} onChanged={refresh} />
          </>
        )}
      </main>
    </div>
  );
}

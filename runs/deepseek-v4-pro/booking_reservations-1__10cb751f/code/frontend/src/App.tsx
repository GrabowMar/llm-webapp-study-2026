import { useState } from "react";
import { clearSession, getUsername } from "./api";
import Auth from "./Auth";
import AvailabilityPanel from "./Availability";
import MyReservations from "./MyReservations";
import AdminPanel from "./AdminPanel";

function todayISO(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 10);
}

export default function App() {
  const [username, setUsername] = useState<string | null>(getUsername());
  const [date, setDate] = useState(todayISO());
  const [refresh, setRefresh] = useState(0);

  const isAdmin = username === "admin";

  if (!username) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="border-b border-gray-200 bg-white">
          <div className="mx-auto max-w-5xl px-4 py-4">
            <h1 className="text-xl font-bold text-gray-900">
              Table Reservations
            </h1>
          </div>
        </header>
        <Auth onSuccess={() => setUsername(getUsername())} />
      </div>
    );
  }

  function bump() {
    setRefresh((r) => r + 1);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <h1 className="text-xl font-bold text-gray-900">
            Table Reservations
          </h1>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-700">
              Signed in as{" "}
              <span className="font-semibold">{username}</span>
              {isAdmin && (
                <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                  admin
                </span>
              )}
            </span>
            <button
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              onClick={() => {
                clearSession();
                setUsername(null);
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        {isAdmin ? (
          <AdminPanel
            date={date}
            onDateChange={setDate}
            refreshTrigger={refresh}
          />
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            <AvailabilityPanel
              date={date}
              onDateChange={setDate}
              onBooked={bump}
              refreshTrigger={refresh}
            />
            <MyReservations refreshTrigger={refresh} onChanged={bump} />
          </div>
        )}
      </main>
    </div>
  );
}

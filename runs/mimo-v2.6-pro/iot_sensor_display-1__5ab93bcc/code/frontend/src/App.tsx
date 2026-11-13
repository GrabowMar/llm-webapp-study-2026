import { useCallback, useEffect, useState } from "react";
import { clearAuth, getStoredUsername } from "./api";
import Dashboard from "./pages/Dashboard";
import SensorPage from "./pages/SensorPage";

function pathSensorId(path: string): number | null {
  const match = /^\/sensors\/(\d+)\/?$/.exec(path);
  return match ? Number(match[1]) : null;
}

export default function App() {
  const [path, setPath] = useState(window.location.pathname);
  const [user, setUser] = useState<string | null>(getStoredUsername());

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = useCallback((to: string) => {
    window.history.pushState({}, "", to);
    setPath(to);
    window.scrollTo(0, 0);
  }, []);

  const handleSignedIn = useCallback((username: string) => {
    setUser(username);
  }, []);

  const handleSignOut = useCallback(() => {
    clearAuth();
    setUser(null);
    navigate("/");
  }, [navigate]);

  const sensorId = pathSensorId(path);

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
          <button
            onClick={() => navigate("/")}
            className="text-xl font-bold text-slate-800 hover:text-indigo-600"
          >
            Sensor Dashboard
          </button>
          {user ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-600">
                Signed in as <span className="font-semibold text-slate-800">{user}</span>
              </span>
              <button
                onClick={handleSignOut}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Sign out
              </button>
            </div>
          ) : null}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        {sensorId !== null ? (
          <SensorPage id={sensorId} user={user} navigate={navigate} />
        ) : (
          <Dashboard user={user} navigate={navigate} onSignedIn={handleSignedIn} />
        )}
      </main>
    </div>
  );
}

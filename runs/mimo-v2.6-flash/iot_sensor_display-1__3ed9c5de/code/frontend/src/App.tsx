import { useEffect, useState } from "react";
import Dashboard from "./components/Dashboard";
import SensorPage from "./components/SensorPage";
import { getAuth, setAuth, type Auth } from "./lib/api";
import { Link, navigate } from "./lib/router";

export default function App() {
  const [auth, setAuthState] = useState<Auth | null>(() => getAuth());
  const [path, setPath] = useState(() => window.location.pathname);

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const match = /^\/sensors\/(\d+)\/?$/.exec(path);
  const sensorId = match ? Number(match[1]) : null;

  function handleAuth(next: Auth) {
    setAuth(next);
    setAuthState(next);
  }

  function signOut() {
    setAuth(null);
    setAuthState(null);
    navigate("/");
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
          <Link
            to="/"
            className="text-lg font-bold tracking-tight text-slate-900"
          >
            Sensor Dashboard
          </Link>
          <div className="flex items-center gap-3 text-sm">
            {auth ? (
              <>
                <span className="text-slate-600">
                  Signed in as{" "}
                  <span className="font-semibold text-slate-900">
                    {auth.username}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={signOut}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-100"
                >
                  Sign out
                </button>
              </>
            ) : (
              <Link
                to="/"
                className="rounded-lg bg-sky-600 px-3 py-1.5 font-medium text-white hover:bg-sky-700"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        {sensorId !== null ? (
          <SensorPage id={sensorId} auth={auth} />
        ) : (
          <Dashboard auth={auth} onAuth={handleAuth} />
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-4 text-xs text-slate-500">
          Sensor Dashboard — latest values refresh every 10 seconds.
        </div>
      </footer>
    </div>
  );
}

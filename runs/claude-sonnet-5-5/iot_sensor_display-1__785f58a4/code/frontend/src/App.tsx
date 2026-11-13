import { useCallback, useEffect, useState } from "react";
import { api, ApiError, loadSession, saveSession, type Session } from "./api";
import AuthForms from "./AuthForms";
import Dashboard from "./Dashboard";
import SensorPage from "./SensorPage";

function usePath() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const navigate = useCallback((to: string) => {
    window.history.pushState(null, "", to);
    setPath(to);
    window.scrollTo(0, 0);
  }, []);
  return { path, navigate };
}

export default function App() {
  const [session, setSession] = useState<Session | null>(loadSession);
  const { path, navigate } = usePath();

  const update = useCallback((s: Session | null) => {
    saveSession(s);
    setSession(s);
  }, []);

  useEffect(() => {
    if (!session) return;
    api("/auth/me", { token: session.token }).catch((err) => {
      if (err instanceof ApiError && err.status === 401) update(null);
    });
  }, [session, update]);

  async function signOut() {
    if (session) {
      try {
        await api("/auth/logout", { method: "POST", token: session.token });
      } catch {
        /* token may already be invalid */
      }
    }
    update(null);
  }

  const match = path.match(/^\/sensors\/(\d+)\/?$/);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigate("/");
          }}
          className="text-xl font-bold"
        >
          Sensor dashboard
        </a>
        {session && (
          <div className="flex items-center gap-3 text-sm">
            <span>
              Signed in as <strong data-testid="username">{session.username}</strong>
            </span>
            <button
              onClick={signOut}
              className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-100"
            >
              Sign out
            </button>
          </div>
        )}
      </header>
      {!session && <AuthForms onSignedIn={update} />}
      {match ? (
        <SensorPage id={Number(match[1])} session={session} navigate={navigate} />
      ) : (
        <Dashboard session={session} navigate={navigate} />
      )}
    </div>
  );
}

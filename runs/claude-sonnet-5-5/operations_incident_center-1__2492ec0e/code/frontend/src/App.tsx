import { useEffect, useSyncExternalStore } from "react";
import { getToken, getUser, setSession, subscribeSession } from "./api";
import { AuthPage } from "./AuthPages";
import { IncidentList } from "./IncidentList";
import { IncidentPage } from "./IncidentPage";
import { NewIncident } from "./NewIncident";
import { PublicPage } from "./PublicPage";
import { Link, navigate, usePath } from "./router";
import { btnSecondaryCls } from "./ui";

function useSession() {
  const token = useSyncExternalStore(subscribeSession, getToken);
  const user = useSyncExternalStore(subscribeSession, getUser);
  return { token, user };
}

const navLink = "text-sm font-medium text-slate-600 hover:text-slate-900";

export default function App() {
  const path = usePath();
  const { token, user } = useSession();

  const isProtected = path.startsWith("/incidents");
  const isAuthPage = path === "/login" || path === "/register";

  useEffect(() => {
    if (isProtected && !token) navigate("/login", true);
    else if (isAuthPage && token) navigate("/incidents", true);
  }, [isProtected, isAuthPage, token]);

  let page;
  const match = path.match(/^\/incidents\/(\d+)\/?$/);
  if (isProtected && !token) page = null;
  else if (path === "/login") page = <AuthPage mode="login" />;
  else if (path === "/register") page = <AuthPage mode="register" />;
  else if (path.replace(/\/$/, "") === "/incidents") page = <IncidentList />;
  else if (path.replace(/\/$/, "") === "/incidents/new") page = <NewIncident />;
  else if (match) page = <IncidentPage key={match[1]} id={Number(match[1])} />;
  else if (path === "/") page = <PublicPage />;
  else page = <p className="text-slate-600">Page not found.</p>;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <nav className="mx-auto flex max-w-5xl items-center gap-5 px-4 py-3">
          <Link to="/" className="text-lg font-semibold text-indigo-700">
            Incident center
          </Link>
          <Link to="/" className={navLink}>
            Status
          </Link>
          {token && (
            <Link to="/incidents" className={navLink}>
              Incidents
            </Link>
          )}
          <div className="ml-auto flex items-center gap-3">
            {token ? (
              <>
                <span className="text-sm text-slate-600">
                  Signed in as <strong data-testid="username">{user}</strong>
                </span>
                <button
                  className={btnSecondaryCls}
                  onClick={() => {
                    setSession(null, null);
                    navigate("/");
                  }}
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className={navLink}>
                  Sign in
                </Link>
                <Link to="/register" className={navLink}>
                  Register
                </Link>
              </>
            )}
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{page}</main>
    </div>
  );
}

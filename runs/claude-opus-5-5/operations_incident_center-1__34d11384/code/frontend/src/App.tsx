import { useEffect, useState, type ReactNode } from "react";
import { api, clearSession, getStoredUsername, getToken, onUnauthorized } from "./api";
import AuthPage from "./pages/AuthPage";
import IncidentListPage from "./pages/IncidentListPage";
import IncidentPage from "./pages/IncidentPage";
import NewIncidentPage from "./pages/NewIncidentPage";
import PublicPage from "./pages/PublicPage";
import { navigate, useLocation } from "./router";
import { Link } from "./ui";

function Redirect({ to }: { to: string }) {
  useEffect(() => navigate(to), [to]);
  return null;
}

export default function App() {
  const { pathname } = useLocation();
  const [username, setUsername] = useState<string | null>(() => (getToken() ? getStoredUsername() ?? "" : null));

  useEffect(() => {
    onUnauthorized(() => {
      clearSession();
      setUsername(null);
      navigate("/login");
    });
    if (getToken()) {
      api<{ username: string }>("/auth/me")
        .then((u) => setUsername(u.username))
        .catch(() => undefined);
    }
    return () => onUnauthorized(null);
  }, []);

  async function signOut() {
    await api("/auth/logout", { method: "POST" }).catch(() => undefined);
    clearSession();
    setUsername(null);
    navigate("/");
  }

  const signedIn = username !== null;
  let page: ReactNode;
  const detail = pathname.match(/^\/incidents\/(\d+)\/?$/);
  if (pathname === "/" || pathname === "/status") page = <PublicPage />;
  else if (pathname === "/login") page = signedIn ? <Redirect to="/incidents" /> : <AuthPage mode="login" onSignedIn={setUsername} />;
  else if (pathname === "/register")
    page = signedIn ? <Redirect to="/incidents" /> : <AuthPage mode="register" onSignedIn={setUsername} />;
  else if (!signedIn && pathname.startsWith("/incidents")) page = <Redirect to="/login" />;
  else if (pathname === "/incidents" || pathname === "/incidents/") page = <IncidentListPage />;
  else if (pathname === "/incidents/new") page = <NewIncidentPage />;
  else if (detail) page = <IncidentPage id={Number(detail[1])} />;
  else
    page = (
      <div className="text-center text-slate-600">
        <p>Page not found.</p>
        <Link href="/" className="text-indigo-600 hover:underline">
          Go home
        </Link>
      </div>
    );

  const navClass = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-sm font-medium ${active ? "bg-slate-800 text-white" : "text-slate-300 hover:bg-slate-800 hover:text-white"}`;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="bg-slate-900">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-lg font-bold text-white">
              Incident Center
            </Link>
            <nav className="flex gap-1">
              <Link href="/" className={navClass(pathname === "/")}>
                Status
              </Link>
              {signedIn && (
                <Link href="/incidents" className={navClass(pathname.startsWith("/incidents"))}>
                  Incidents
                </Link>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            {signedIn ? (
              <>
                <span className="text-sm text-slate-300">
                  Signed in as <strong className="text-white" data-testid="current-user">{username}</strong>
                </span>
                <button
                  type="button"
                  onClick={signOut}
                  className="rounded-md border border-slate-600 px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-slate-800"
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link href="/login" className={navClass(pathname === "/login")}>
                  Sign in
                </Link>
                <Link href="/register" className={navClass(pathname === "/register")}>
                  Register
                </Link>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{page}</main>
    </div>
  );
}

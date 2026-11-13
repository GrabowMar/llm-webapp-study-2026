import { useEffect, type ReactNode } from "react";
import { AuthProvider, useAuth } from "./auth";
import { Link, navigate, usePath } from "./router";
import PublicPage from "./pages/PublicPage";
import AuthPage from "./pages/AuthPage";
import IncidentListPage from "./pages/IncidentListPage";
import IncidentDetailPage from "./pages/IncidentDetailPage";
import NewIncidentPage from "./pages/NewIncidentPage";

function RequireAuth({ children }: { children: ReactNode }) {
  const { username } = useAuth();
  useEffect(() => {
    if (!username) {
      navigate("/login");
    }
  }, [username]);
  if (!username) {
    return null;
  }
  return <>{children}</>;
}

function NotFoundPage() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
      <h1 className="text-xl font-bold text-slate-900">Page not found</h1>
      <p className="mt-2 text-sm text-slate-500">
        The page you are looking for does not exist.
      </p>
      <Link
        to="/"
        className="mt-4 inline-block text-sm font-semibold text-blue-600 hover:text-blue-800"
      >
        Back to the incident center
      </Link>
    </div>
  );
}

function Navbar() {
  const { username, signOut } = useAuth();

  const handleSignOut = () => {
    signOut();
    navigate("/");
  };

  return (
    <nav className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link to="/" className="flex items-center gap-2" title="Public status">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-600 text-xs font-bold text-white">
            IC
          </span>
          <span className="text-base font-bold tracking-tight text-slate-900">
            Incident Center
          </span>
        </Link>
        <div className="flex items-center gap-1 text-sm">
          <Link
            to="/"
            className="rounded-lg px-3 py-2 font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          >
            Status
          </Link>
          {username ? (
            <>
              <Link
                to="/incidents"
                className="rounded-lg px-3 py-2 font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              >
                Incidents
              </Link>
              <Link
                to="/incidents/new"
                className="rounded-lg bg-blue-600 px-3 py-2 font-semibold text-white hover:bg-blue-700"
              >
                Open incident
              </Link>
              <span
                className="ml-2 max-w-[10rem] truncate rounded-lg bg-slate-100 px-3 py-2 font-medium text-slate-700"
                title={username}
              >
                {username}
              </span>
              <button
                type="button"
                onClick={handleSignOut}
                className="rounded-lg border border-slate-300 px-3 py-2 font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link
                to="/login"
                className="rounded-lg px-3 py-2 font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              >
                Sign in
              </Link>
              <Link
                to="/register"
                className="rounded-lg bg-blue-600 px-3 py-2 font-semibold text-white hover:bg-blue-700"
              >
                Register
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

function Router() {
  const path = usePath();
  const incidentMatch = /^\/incidents\/(\d+)$/.exec(path);

  let page: ReactNode;
  if (path === "/" || path === "") {
    page = <PublicPage />;
  } else if (path === "/login") {
    page = <AuthPage mode="login" />;
  } else if (path === "/register") {
    page = <AuthPage mode="register" />;
  } else if (path === "/incidents") {
    page = (
      <RequireAuth>
        <IncidentListPage />
      </RequireAuth>
    );
  } else if (path === "/incidents/new") {
    page = (
      <RequireAuth>
        <NewIncidentPage />
      </RequireAuth>
    );
  } else if (incidentMatch) {
    page = (
      <RequireAuth>
        <IncidentDetailPage id={Number(incidentMatch[1])} />
      </RequireAuth>
    );
  } else {
    page = <NotFoundPage />;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="mx-auto max-w-6xl px-4 py-8">{page}</main>
      <footer className="mx-auto max-w-6xl px-4 pb-8 text-xs text-slate-400">
        Incident Center — operations team console
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Router />
    </AuthProvider>
  );
}

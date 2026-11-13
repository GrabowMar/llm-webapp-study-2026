import { AuthProvider, useAuth } from "./auth";
import { Link, usePath } from "./router";
import { AuthPage } from "./pages/AuthPage";
import { IncidentListPage } from "./pages/IncidentListPage";
import {
  IncidentDetailPage,
  NewIncidentPage,
} from "./pages/IncidentDetailPage";
import { PublicStatsPage } from "./pages/PublicStatsPage";

function Shell() {
  const path = usePath();
  const { username, signOut } = useAuth();

  const navClass = (active: boolean) =>
    `rounded-md px-3 py-2 text-sm font-medium ${
      active
        ? "bg-slate-900 text-white"
        : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
    }`;

  let page: React.ReactNode;
  if (path === "/login") {
    page = username ? <IncidentListPage /> : <AuthPage mode="login" />;
  } else if (path === "/register") {
    page = username ? <IncidentListPage /> : <AuthPage mode="register" />;
  } else if (!username) {
    page = path === "/" ? <PublicStatsPage /> : <AuthPage mode="login" />;
  } else if (path === "/incidents") {
    page = <IncidentListPage />;
  } else if (path === "/incidents/new") {
    page = <NewIncidentPage />;
  } else if (path.startsWith("/incidents/")) {
    const id = path.slice("/incidents/".length);
    page = /^\d+$/.test(id) ? (
      <IncidentDetailPage id={id} />
    ) : (
      <PublicStatsPage />
    );
  } else {
    page = <PublicStatsPage />;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <Link to="/" className="text-lg font-semibold text-slate-900">
              Incident Center
            </Link>
            <nav className="flex items-center gap-1">
              <Link to="/" className={navClass(path === "/")}>
                Public
              </Link>
              {username && (
                <>
                  <Link to="/incidents" className={navClass(path === "/incidents")}>
                    Incidents
                  </Link>
                  <Link
                    to="/incidents/new"
                    className={navClass(path === "/incidents/new")}
                  >
                    Open incident
                  </Link>
                </>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            {username ? (
              <>
                <span className="text-sm text-slate-600">
                  Signed in as <span className="font-semibold text-slate-900">{username}</span>
                </span>
                <button
                  type="button"
                  onClick={signOut}
                  className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50"
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50"
                >
                  Sign in
                </Link>
                <Link
                  to="/register"
                  className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
                >
                  Register
                </Link>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">{page}</main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}

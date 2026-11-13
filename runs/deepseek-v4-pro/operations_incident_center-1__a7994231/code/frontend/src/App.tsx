import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { clearAuth, getToken, getUsername } from "./api";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import PublicPage from "./pages/PublicPage";
import IncidentsPage from "./pages/IncidentsPage";
import NewIncidentPage from "./pages/NewIncidentPage";
import IncidentPage from "./pages/IncidentPage";

function Layout() {
  const username = getUsername();

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <a href="/" className="text-lg font-bold text-slate-900">
            Incident Center
          </a>
          <nav className="flex items-center gap-4">
            <a href="/" className="text-sm text-slate-600 hover:text-slate-900">
              Public status
            </a>
            {username && (
              <a
                href="/incidents"
                className="text-sm text-slate-600 hover:text-slate-900"
              >
                Incidents
              </a>
            )}
            {username ? (
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-slate-700">{username}</span>
                <button
                  onClick={() => {
                    clearAuth();
                    window.location.href = "/login";
                  }}
                  className="rounded border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-100"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <a
                href="/login"
                className="rounded bg-blue-600 px-3 py-1 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Sign in
              </a>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}

function RequireAuth() {
  return getToken() ? <Outlet /> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<PublicPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route element={<RequireAuth />}>
          <Route path="/incidents" element={<IncidentsPage />} />
          <Route path="/incidents/new" element={<NewIncidentPage />} />
          <Route path="/incidents/:id" element={<IncidentPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

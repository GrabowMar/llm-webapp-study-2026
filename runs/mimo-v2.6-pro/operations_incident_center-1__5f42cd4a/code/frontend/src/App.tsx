import type { ReactNode } from "react";
import { BrowserRouter, Navigate, NavLink, Route, Routes, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth";
import IncidentDetailPage from "./pages/IncidentDetail";
import IncidentListPage from "./pages/IncidentList";
import LoginPage from "./pages/Login";
import OpenIncidentPage from "./pages/OpenIncident";
import PublicStatsPage from "./pages/PublicStats";
import RegisterPage from "./pages/Register";
import { getToken } from "./api";

function Protected({ children }: { children: ReactNode }) {
  if (!getToken()) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-2 text-sm font-medium ${
    isActive ? "bg-slate-800 text-white" : "text-slate-300 hover:bg-slate-700 hover:text-white"
  }`;

function Header() {
  const { username, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="bg-slate-900">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <NavLink to="/" className="mr-2 text-lg font-bold tracking-tight text-white">
          Incident Center
        </NavLink>
        <nav className="flex items-center gap-1">
          <NavLink to="/" className={navLinkClass} end>
            Public status
          </NavLink>
          {username ? (
            <>
              <NavLink to="/incidents" className={navLinkClass}>
                Incidents
              </NavLink>
              <NavLink to="/incidents/new" className={navLinkClass}>
                Open incident
              </NavLink>
            </>
          ) : null}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          {username ? (
            <>
              <span className="text-sm text-slate-300">
                Signed in as <span className="font-semibold text-white">{username}</span>
              </span>
              <button
                type="button"
                className="rounded-md border border-slate-600 px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-slate-800"
                onClick={() => {
                  signOut();
                  navigate("/");
                }}
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <NavLink to="/login" className={navLinkClass}>
                Sign in
              </NavLink>
              <NavLink to="/register" className={navLinkClass}>
                Register
              </NavLink>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="min-h-screen bg-slate-50">
          <Header />
          <main>
            <Routes>
              <Route path="/" element={<PublicStatsPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route
                path="/incidents"
                element={
                  <Protected>
                    <IncidentListPage />
                  </Protected>
                }
              />
              <Route
                path="/incidents/new"
                element={
                  <Protected>
                    <OpenIncidentPage />
                  </Protected>
                }
              />
              <Route
                path="/incidents/:id"
                element={
                  <Protected>
                    <IncidentDetailPage />
                  </Protected>
                }
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}

import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { clearSession, getToken, getUsername, setSession } from "./api";
import { AuthContext, useAuth } from "./auth";
import IncidentDetail from "./pages/IncidentDetail";
import IncidentListPage from "./pages/IncidentList";
import Login from "./pages/Login";
import NewIncident from "./pages/NewIncident";
import PublicPage from "./pages/PublicPage";

function Header() {
  const auth = useAuth();
  const navigate = useNavigate();
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-6">
          <Link to="/" className="text-lg font-bold text-indigo-700">
            🚨 Incident Center
          </Link>
          <nav className="flex items-center gap-4 text-sm font-medium text-gray-600">
            <Link to="/public" className="hover:text-gray-900">
              Public overview
            </Link>
            {auth.token && (
              <>
                <Link to="/incidents" className="hover:text-gray-900">
                  Incidents
                </Link>
                <Link to="/incidents/new" className="hover:text-gray-900">
                  Open incident
                </Link>
              </>
            )}
          </nav>
        </div>
        {auth.token ? (
          <div className="flex items-center gap-3 text-sm">
            <span className="text-gray-600">
              Signed in as <strong className="text-gray-900">{auth.username}</strong>
            </span>
            <button
              onClick={() => {
                auth.signOut();
                navigate("/login");
              }}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-50"
            >
              Sign out
            </button>
          </div>
        ) : (
          <Link
            to="/login"
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}

function RequireAuth({ children }: { children: React.ReactElement }) {
  const auth = useAuth();
  if (!auth.token) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const [token, setToken] = useState<string | null>(() => getToken());
  const [username, setUsername] = useState<string | null>(() => getUsername());

  const signIn = useCallback((t: string, u: string) => {
    setSession(t, u);
    setToken(t);
    setUsername(u);
  }, []);

  const signOut = useCallback(() => {
    clearSession();
    setToken(null);
    setUsername(null);
  }, []);

  useEffect(() => {
    const handler = () => {
      clearSession();
      setToken(null);
      setUsername(null);
    };
    window.addEventListener("ic:unauthorized", handler);
    return () => window.removeEventListener("ic:unauthorized", handler);
  }, []);

  return (
    <AuthContext.Provider value={{ username, token, signIn, signOut }}>
      <div className="min-h-screen bg-gray-100">
        <Header />
        <main className="mx-auto max-w-6xl px-4 py-8">
          <Routes>
            <Route path="/" element={<Navigate to="/public" replace />} />
            <Route path="/public" element={<PublicPage />} />
            <Route path="/login" element={<Login />} />
            <Route
              path="/incidents"
              element={
                <RequireAuth>
                  <IncidentListPage />
                </RequireAuth>
              }
            />
            <Route
              path="/incidents/new"
              element={
                <RequireAuth>
                  <NewIncident />
                </RequireAuth>
              }
            />
            <Route
              path="/incidents/:id"
              element={
                <RequireAuth>
                  <IncidentDetail />
                </RequireAuth>
              }
            />
            <Route path="*" element={<Navigate to="/public" replace />} />
          </Routes>
        </main>
      </div>
    </AuthContext.Provider>
  );
}

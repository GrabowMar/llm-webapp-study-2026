import { Link, Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth";
import { btnSecondaryCls } from "./ui";
import AuthPage from "./pages/AuthPage";
import ItemForm from "./pages/ItemForm";
import ItemPage from "./pages/ItemPage";
import Inventory from "./pages/Inventory";
import type { ReactNode } from "react";

function RequireAuth({ children }: { children: ReactNode }) {
  const { username } = useAuth();
  return username ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  const { username, logout } = useAuth();
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link to="/" className="text-lg font-semibold text-indigo-700">
            Inventory
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            {username ? (
              <>
                <span>
                  Signed in as <strong data-testid="username">{username}</strong>
                </span>
                <button type="button" className={btnSecondaryCls} onClick={logout}>
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="text-indigo-700 hover:underline">
                  Sign in
                </Link>
                <Link to="/register" className="text-indigo-700 hover:underline">
                  Register
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Routes>
          <Route path="/" element={<Inventory />} />
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/register" element={<AuthPage mode="register" />} />
          <Route path="/items/new" element={<RequireAuth><ItemForm /></RequireAuth>} />
          <Route path="/items/:id" element={<ItemPage />} />
          <Route path="/items/:id/edit" element={<RequireAuth><ItemForm /></RequireAuth>} />
          <Route path="*" element={<p>Page not found.</p>} />
        </Routes>
      </main>
    </div>
  );
}

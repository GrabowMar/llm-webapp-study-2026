import { useState } from "react";
import type { ReactNode } from "react";
import { Link, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth";
import Account from "./pages/Account";
import ForgotPassword from "./pages/ForgotPassword";
import Login from "./pages/Login";
import Mailbox from "./pages/Mailbox";
import Register from "./pages/Register";
import Reset from "./pages/Reset";

function NavItem({ to, children, onNavigate }: { to: string; children: ReactNode; onNavigate?: () => void }) {
  return (
    <Link
      to={to}
      onClick={onNavigate}
      className="rounded-md px-2 py-1 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
    >
      {children}
    </Link>
  );
}

function Home() {
  const { user, loading } = useAuth();
  if (loading) return <p className="text-sm text-slate-500">Loading…</p>;
  return <Navigate to={user ? "/account" : "/login"} replace />;
}

function Layout() {
  const { user, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);


  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Link to="/" className="text-lg font-bold text-blue-700">
              Accounts
            </Link>
            <nav className="ml-4 hidden items-center gap-1 sm:flex">
              {user ? (
                <>
                  <NavItem to="/account">My account</NavItem>
                  <NavItem to="/mailbox">Mailbox</NavItem>
                </>
              ) : (
                <>
                  <NavItem to="/login">Sign in</NavItem>
                  <NavItem to="/register">Register</NavItem>
                  <NavItem to="/forgot-password">Forgot password?</NavItem>
                  <NavItem to="/mailbox">Mailbox</NavItem>
                </>
              )}
            </nav>
          </div>
          <div className="hidden items-center gap-3 sm:flex">
            {user ? (
              <>
                <span className="text-sm text-slate-600">Signed in as {user.username}</span>
                <button
                  onClick={signOut}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Sign out
                </button>
              </>
            ) : null}
          </div>
          <button
            className="rounded-md border border-slate-300 px-2 py-1 text-slate-600 sm:hidden"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Toggle navigation"
          >
            Menu
          </button>
        </div>
        {menuOpen && (
          <nav className="flex flex-col items-start gap-1 border-t border-slate-200 px-4 py-2 sm:hidden">
            {user ? (
              <>
                <NavItem to="/account" onNavigate={() => setMenuOpen(false)}>My account</NavItem>
                <NavItem to="/mailbox" onNavigate={() => setMenuOpen(false)}>Mailbox</NavItem>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    signOut();
                  }}
                  className="mt-1 text-sm font-medium text-red-600"
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <NavItem to="/login" onNavigate={() => setMenuOpen(false)}>Sign in</NavItem>
                <NavItem to="/register" onNavigate={() => setMenuOpen(false)}>Register</NavItem>
                <NavItem to="/forgot-password" onNavigate={() => setMenuOpen(false)}>
                  Forgot password?
                </NavItem>
                <NavItem to="/mailbox" onNavigate={() => setMenuOpen(false)}>Mailbox</NavItem>
              </>
            )}
          </nav>
        )}
      </header>
      <main className="mx-auto max-w-4xl px-4 py-10">
        <Outlet />
      </main>
    </div>
  );
}

function Protected() {
  const { user, loading } = useAuth();
  if (loading) return <p className="text-sm text-slate-500">Loading…</p>;
  return user ? <Outlet /> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />
        <Route path="forgot-password" element={<ForgotPassword />} />
        <Route path="reset" element={<Reset />} />
        <Route path="mailbox" element={<Mailbox />} />
        <Route element={<Protected />}>
          <Route path="account" element={<Account />} />
        </Route>
      </Route>
    </Routes>
  );
}

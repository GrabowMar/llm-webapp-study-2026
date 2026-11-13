import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";

function navClass({ isActive }: { isActive: boolean }): string {
  return [
    "rounded-lg px-3 py-1.5 text-sm font-medium transition",
    isActive
      ? "bg-white text-slate-900 shadow-sm"
      : "text-slate-300 hover:text-white",
  ].join(" ");
}

export default function Layout() {
  const { isSignedIn, username, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/");
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-800 bg-slate-900">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-2 text-white">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-500 text-sm font-black text-slate-900">
              S
            </span>
            <span className="text-lg font-semibold tracking-tight">
              Sensor<span className="text-emerald-400">Hub</span>
            </span>
          </Link>

          <nav className="ml-auto flex items-center gap-2">
            <NavLink to="/" end className={navClass}>
              Dashboard
            </NavLink>
            {isSignedIn ? (
              <>
                <span className="hidden items-center gap-2 rounded-full bg-slate-800 px-3 py-1.5 text-sm text-slate-200 sm:flex">
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-500 text-xs font-bold text-slate-900">
                    {username?.[0]?.toUpperCase()}
                  </span>
                  {username}
                </span>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:text-white"
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <NavLink to="/login" className={navClass}>
                  Sign in
                </NavLink>
                <Link
                  to="/register"
                  className="rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-slate-900 transition hover:bg-emerald-400"
                >
                  Register
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <Outlet />
      </main>

      <footer className="mx-auto max-w-6xl px-4 pb-8 text-center text-xs text-slate-400 sm:px-6">
        SensorHub · live sensor dashboard · refreshes every 10 seconds
      </footer>
    </div>
  );
}

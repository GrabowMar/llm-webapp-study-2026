import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { clearSession, getUsername } from "./api";

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: "bg-green-100 text-green-800",
    past_due: "bg-red-100 text-red-800",
    trial: "bg-blue-100 text-blue-800",
    cancelled: "bg-gray-200 text-gray-700",
    open: "bg-amber-100 text-amber-800",
    paid: "bg-green-100 text-green-800",
  };
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
        colors[status] ?? "bg-gray-100 text-gray-700"
      }`}
    >
      {status}
    </span>
  );
}

export default function Layout() {
  const navigate = useNavigate();
  const username = getUsername();

  const signOut = () => {
    clearSession();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <Link to="/" className="text-lg font-semibold text-gray-900">
              Billing Console
            </Link>
            {username && (
              <nav className="flex gap-4 text-sm">
                <NavLink
                  to="/subscriptions"
                  className={({ isActive }) =>
                    isActive
                      ? "font-medium text-indigo-600"
                      : "text-gray-600 hover:text-gray-900"
                  }
                >
                  Subscriptions
                </NavLink>
              </nav>
            )}
          </div>
          <div className="flex items-center gap-3">
            {username ? (
              <>
                <span className="text-sm text-gray-600">{username}</span>
                <button
                  onClick={signOut}
                  className="rounded-md border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-100"
                >
                  Sign out
                </button>
              </>
            ) : (
              <div className="flex gap-2">
                <Link
                  to="/login"
                  className="rounded-md border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-100"
                >
                  Sign in
                </Link>
                <Link
                  to="/register"
                  className="rounded-md bg-indigo-600 px-3 py-1 text-sm text-white hover:bg-indigo-700"
                >
                  Register
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}

export { StatusBadge };

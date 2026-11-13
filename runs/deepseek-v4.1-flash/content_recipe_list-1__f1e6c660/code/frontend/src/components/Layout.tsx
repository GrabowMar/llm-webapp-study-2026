import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";

export default function Layout() {
  const { username, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen">
      <header className="border-b border-stone-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <NavLink to="/" className="flex items-center gap-2">
            <span className="text-2xl" aria-hidden="true">
              🍳
            </span>
            <span className="text-xl font-bold tracking-tight text-stone-900">
              Recipe Book
            </span>
          </NavLink>

          <nav className="flex items-center gap-2 sm:gap-3">
            {username ? (
              <>
                <NavLink
                  to="/recipes/new"
                  className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-700"
                >
                  Add recipe
                </NavLink>
                <span className="text-sm text-stone-600">
                  Signed in as{" "}
                  <span className="font-semibold text-stone-900">
                    {username}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    signOut();
                    navigate("/");
                  }}
                  className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-100"
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <NavLink
                  to="/login"
                  className="rounded-lg px-3 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-100"
                >
                  Sign in
                </NavLink>
                <NavLink
                  to="/register"
                  className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-700"
                >
                  Register
                </NavLink>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <Outlet />
      </main>

      <footer className="mx-auto max-w-5xl px-4 pb-8 text-sm text-stone-400 sm:px-6">
        A small recipe book built with Flask and React.
      </footer>
    </div>
  );
}

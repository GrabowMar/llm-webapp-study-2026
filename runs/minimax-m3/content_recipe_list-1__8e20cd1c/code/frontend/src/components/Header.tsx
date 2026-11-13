import { Link } from "react-router-dom";
import { useAuth } from "../auth";

export default function Header() {
  const { user, logout } = useAuth();

  return (
    <header className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4">
        <Link to="/" className="font-display text-2xl font-bold tracking-tight text-stone-900">
          Recipe Book
        </Link>
        <nav className="flex items-center gap-3 text-sm">
          {user ? (
            <>
              <span className="text-stone-600">
                Signed in as <span className="font-semibold text-stone-900">{user.username}</span>
              </span>
              <button
                type="button"
                onClick={logout}
                className="rounded-lg border border-stone-300 px-3 py-1.5 font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-100"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link
                to="/signin"
                className="rounded-lg px-3 py-1.5 font-medium text-stone-700 transition hover:bg-stone-100"
              >
                Sign in
              </Link>
              <Link
                to="/register"
                className="rounded-lg bg-stone-900 px-3 py-1.5 font-medium text-white transition hover:bg-stone-700"
              >
                Register
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

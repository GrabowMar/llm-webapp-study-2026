import type { ReactNode } from "react";
import { useAuth } from "../lib/auth";
import { Link, useRouter } from "../lib/router";

export function Layout({ children }: { children: ReactNode }) {
  const { user, isAdmin, signOut } = useAuth();
  const { path, navigate } = useRouter();

  const navLink = (target: string, label: string) => {
    const active = path === target;
    return (
      <Link
        to={target}
        className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
          active
            ? "bg-slate-900 text-white"
            : "text-slate-300 hover:bg-slate-800 hover:text-white"
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-slate-900">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-4">
          <Link to="/" className="mr-2 flex items-center gap-2 text-lg font-bold text-white">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500 text-sm">
              SL
            </span>
            Sign-in with lockout
          </Link>

          <nav className="flex items-center gap-1">
            {user ? navLink("/account", "Account") : null}
            {isAdmin ? navLink("/admin", "Admin") : null}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            {user ? (
              <>
                <span className="hidden text-sm text-slate-300 sm:inline">
                  Signed in as{" "}
                  <span className="font-semibold text-white">{user.username}</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    signOut();
                    navigate("/login");
                  }}
                  className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm font-semibold text-slate-200 transition hover:bg-slate-800"
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white"
                >
                  Sign in
                </Link>
                <Link
                  to="/register"
                  className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
                >
                  Register
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-10">{children}</main>

      <footer className="mx-auto max-w-5xl px-4 pb-10 text-xs text-slate-400">
        Accounts are locked for 15 minutes after 5 consecutive failed sign-ins. Sign-ins are
        limited to 20 attempts per minute per client.
      </footer>
    </div>
  );
}

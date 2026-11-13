import type { ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";

import { useAuth } from "../auth";

function navClass({ isActive }: { isActive: boolean }): string {
  return `rounded-lg px-3 py-1.5 text-sm font-medium transition ${
    isActive ? "bg-slate-100 text-slate-900" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
  }`;
}

export default function Layout({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center gap-2 px-4 py-3">
          <Link to="/" className="mr-auto flex items-center gap-2 text-lg font-bold tracking-tight">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-black text-white">
              I
            </span>
            Inkwell
          </Link>

          <nav className="flex items-center gap-1">
            <NavLink to="/" end className={navClass}>
              Posts
            </NavLink>
            {user ? (
              <NavLink to="/new" className={navClass}>
                Write
              </NavLink>
            ) : null}
          </nav>

          {user ? (
            <div className="flex items-center gap-2 border-l border-slate-200 pl-3">
              <span className="hidden text-sm text-slate-600 sm:inline">
                Signed in as{" "}
                <span className="font-semibold text-slate-900">{user.username}</span>
                {user.is_admin ? (
                  <span className="ml-1 rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-indigo-700">
                    admin
                  </span>
                ) : null}
              </span>
              <button
                type="button"
                onClick={handleSignOut}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Sign out
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 border-l border-slate-200 pl-3">
              <NavLink
                to="/login"
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
              >
                Sign in
              </NavLink>
              <Link
                to="/register"
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-500"
              >
                Register
              </Link>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">{children}</main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto w-full max-w-4xl px-4 py-6 text-sm text-slate-500">
          Inkwell — a multi-author blog. Everyone can read, authors can write.
        </div>
      </footer>
    </div>
  );
}

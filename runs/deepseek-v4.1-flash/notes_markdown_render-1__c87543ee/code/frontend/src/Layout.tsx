import type { ReactNode } from "react";
import { Link, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "./auth";

export default function Layout({ children }: { children?: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function onLogout() {
    await logout();
    navigate("/");
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link to="/notes" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
              M
            </span>
            <span className="text-sm font-semibold tracking-tight">
              Markdown Notes
            </span>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            {user && (
              <>
                <span className="hidden text-slate-500 sm:inline">
                  Signed in as{" "}
                  <span className="font-medium text-slate-800">
                    {user.username}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={onLogout}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Sign out
                </button>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">
        {children ?? <Outlet />}
      </main>
    </div>
  );
}

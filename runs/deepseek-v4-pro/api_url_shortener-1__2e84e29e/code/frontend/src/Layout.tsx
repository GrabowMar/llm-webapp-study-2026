import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { AuthState } from "./api";
import { clearAuth } from "./api";

interface Props {
  auth: AuthState | null;
  setAuth: (a: AuthState | null) => void;
  children: ReactNode;
}

export default function Layout({ auth, setAuth, children }: Props) {
  const isAdmin = auth?.username === "admin";

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <Link to="/" className="text-lg font-bold text-indigo-600">
            Shortly
          </Link>
          {auth ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-600">
                Signed in as{" "}
                <span className="font-semibold">{auth.username}</span>
              </span>
              {isAdmin && (
                <Link
                  to="/admin"
                  className="rounded bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
                >
                  Admin
                </Link>
              )}
              <button
                onClick={() => {
                  clearAuth();
                  setAuth(null);
                }}
                className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
              >
                Sign out
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Link
                to="/login"
                className="text-sm font-medium text-slate-600 hover:text-slate-900"
              >
                Sign in
              </Link>
              <Link
                to="/register"
                className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
              >
                Sign up
              </Link>
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
    </div>
  );
}

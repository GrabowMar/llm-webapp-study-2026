import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../auth";

export default function AppShell({ children }: { children: ReactNode }) {
  const { username, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link to="/customers" className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
              CD
            </span>
            <span className="text-base font-semibold tracking-tight text-slate-900">
              Customer Directory
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-500 sm:inline">
              Signed in as <span className="font-medium text-slate-700">{username}</span>
            </span>
            <button
              type="button"
              onClick={() => void signOut()}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}

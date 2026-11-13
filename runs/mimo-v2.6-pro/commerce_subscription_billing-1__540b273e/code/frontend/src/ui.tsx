import type { ReactNode } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "./auth";

export const STATUSES = ["trial", "active", "past_due", "cancelled"] as const;

export const STATUS_LABELS: Record<string, string> = {
  trial: "Trial",
  active: "Active",
  past_due: "Past due",
  cancelled: "Cancelled",
};

const STATUS_STYLES: Record<string, string> = {
  trial: "bg-amber-100 text-amber-800",
  active: "bg-emerald-100 text-emerald-800",
  past_due: "bg-rose-100 text-rose-800",
  cancelled: "bg-slate-200 text-slate-700",
};

export function normalizeStatus(status: string): string {
  const value = status.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return value === "canceled" ? "cancelled" : value;
}

const moneyFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatMoney(value: number): string {
  return moneyFormatter.format(value);
}

export function formatDate(value: string): string {
  return value.slice(0, 10);
}

export const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

export function buttonClass(
  variant: "primary" | "secondary" | "danger" = "primary",
): string {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50";
  const variants = {
    primary: "bg-indigo-600 text-white hover:bg-indigo-500",
    secondary: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
    danger: "bg-rose-600 text-white hover:bg-rose-500",
  };
  return `${base} ${variants[variant]}`;
}

export function Card({
  title,
  actions,
  children,
}: {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      {title || actions ? (
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-6 py-4">
          {title ? (
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          ) : (
            <span />
          )}
          {actions}
        </div>
      ) : null}
      <div className="px-6 py-5">{children}</div>
    </section>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
      {message}
    </div>
  );
}

export function Notice({ message }: { message: string }) {
  return (
    <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
      {message}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </span>
      {children}
      {hint ? (
        <span className="mt-1 block text-xs text-slate-500">{hint}</span>
      ) : null}
    </label>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const key = normalizeStatus(status);
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[key] ?? "bg-slate-100 text-slate-700"}`}
    >
      {STATUS_LABELS[key] ?? status}
    </span>
  );
}

export function Layout() {
  const { session, signOut } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="bg-slate-900 text-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
          <Link
            to="/"
            className="flex items-center gap-2 text-lg font-semibold tracking-tight"
          >
            <span className="inline-block h-3 w-3 rounded-sm bg-indigo-400" />
            Billing Console
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                isActive
                  ? "font-medium text-white"
                  : "text-slate-300 hover:text-white"
              }
            >
              Overview
            </NavLink>
            {session ? (
              <NavLink
                to="/subscriptions"
                className={({ isActive }) =>
                  isActive
                    ? "font-medium text-white"
                    : "text-slate-300 hover:text-white"
                }
              >
                Subscriptions
              </NavLink>
            ) : null}
          </nav>
          <div className="flex items-center gap-3 text-sm">
            {session ? (
              <>
                <span className="text-slate-300">{session.username}</span>
                <button
                  type="button"
                  onClick={() => {
                    signOut();
                    navigate("/");
                  }}
                  className="rounded-lg border border-slate-600 px-3 py-1.5 text-slate-200 hover:bg-slate-800 hover:text-white"
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="rounded-lg px-3 py-1.5 text-slate-200 hover:text-white"
                >
                  Sign in
                </Link>
                <Link
                  to="/register"
                  className="rounded-lg bg-indigo-500 px-3 py-1.5 font-medium text-white hover:bg-indigo-400"
                >
                  Register
                </Link>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}

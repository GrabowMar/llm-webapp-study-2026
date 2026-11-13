import { useEffect, type ReactNode } from "react";
import { signOut } from "./api";
import { LoadingNote } from "./components";
import { navigate, useAuth, usePathname } from "./router";
import AuthPage from "./pages/AuthPage";
import PublicPage from "./pages/PublicPage";
import SubscriptionDetailPage from "./pages/SubscriptionDetailPage";
import SubscriptionsPage from "./pages/SubscriptionsPage";

function NavLink({
  to,
  label,
  active,
}: {
  to: string;
  label: string;
  active: boolean;
}) {
  return (
    <a
      href={to}
      onClick={(event) => {
        event.preventDefault();
        navigate(to);
      }}
      className={`rounded-md px-3 py-2 text-sm font-medium transition ${
        active
          ? "bg-slate-100 text-slate-900"
          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
      }`}
    >
      {label}
    </a>
  );
}

function Header() {
  const auth = useAuth();
  const path = usePathname();

  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-center gap-2">
          <a
            href="/"
            onClick={(event) => {
              event.preventDefault();
              navigate("/");
            }}
            className="flex items-center gap-2 text-sm font-semibold tracking-tight text-slate-900"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
              B
            </span>
            <span>Billing Console</span>
          </a>
          <nav className="ml-4 hidden items-center gap-1 sm:flex">
            <NavLink to="/" label="Summary" active={path === "/"} />
            {auth.token && (
              <NavLink
                to="/subscriptions"
                label="Subscriptions"
                active={path.startsWith("/subscriptions")}
              />
            )}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {auth.token ? (
            <>
              <span className="hidden text-sm text-slate-600 sm:inline">
                {auth.username}
              </span>
              <button
                type="button"
                onClick={() => {
                  signOut();
                  navigate("/");
                }}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <a
                href="/login"
                onClick={(event) => {
                  event.preventDefault();
                  navigate("/login");
                }}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:text-slate-900"
              >
                Sign in
              </a>
              <a
                href="/register"
                onClick={(event) => {
                  event.preventDefault();
                  navigate("/register");
                }}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-500"
              >
                Register
              </a>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const auth = useAuth();
  useEffect(() => {
    if (!auth.token) navigate("/login");
  }, [auth.token]);
  if (!auth.token) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16">
        <LoadingNote label="Redirecting to sign in…" />
      </div>
    );
  }
  return <>{children}</>;
}

function NotFoundPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 text-center">
      <p className="text-sm font-medium text-slate-500">404</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">
        Page not found
      </h1>
      <a
        href="/"
        onClick={(event) => {
          event.preventDefault();
          navigate("/");
        }}
        className="mt-6 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500"
      >
        Back to summary
      </a>
    </div>
  );
}

export default function App() {
  const path = usePathname();

  let page: ReactNode;
  const detailMatch = /^\/subscriptions\/(\d+)\/?$/.exec(path);

  if (path === "/" || path === "") {
    page = <PublicPage />;
  } else if (path === "/login") {
    page = <AuthPage mode="login" />;
  } else if (path === "/register") {
    page = <AuthPage mode="register" />;
  } else if (path === "/subscriptions" || path === "/subscriptions/") {
    page = (
      <RequireAuth>
        <SubscriptionsPage />
      </RequireAuth>
    );
  } else if (detailMatch) {
    page = (
      <RequireAuth>
        <SubscriptionDetailPage id={Number(detailMatch[1])} />
      </RequireAuth>
    );
  } else {
    page = <NotFoundPage />;
  }

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-8">{page}</main>
      <footer className="mx-auto max-w-6xl px-4 pb-8 text-center text-xs text-slate-400">
        Subscription billing console
      </footer>
    </div>
  );
}

import { useEffect, useState } from "react";
import { api, session, setUnauthorizedHandler } from "./api";
import AuthPage from "./pages/AuthPage";
import PublicPage from "./pages/PublicPage";
import SubscriptionPage from "./pages/SubscriptionPage";
import SubscriptionsPage from "./pages/SubscriptionsPage";
import { navigate, useLocation } from "./router";
import { Button, Link } from "./ui";

export default function App() {
  const { pathname, search } = useLocation();
  const [username, setUsername] = useState<string | null>(session.token ? session.username : null);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      session.clear();
      setUsername(null);
      navigate("/login", true);
    });
  }, []);

  async function signOut() {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    session.clear();
    setUsername(null);
    navigate("/");
  }

  const subMatch = pathname.match(/^\/subscriptions\/(\d+)\/?$/);
  const needsAuth = pathname.startsWith("/subscriptions");

  useEffect(() => {
    if (needsAuth && !username) navigate("/login", true);
    if ((pathname === "/login" || pathname === "/register") && username) navigate("/subscriptions", true);
  }, [needsAuth, username, pathname]);

  let page;
  if (pathname === "/login") page = <AuthPage key="login" mode="login" onSignedIn={setUsername} />;
  else if (pathname === "/register") page = <AuthPage key="register" mode="register" onSignedIn={setUsername} />;
  else if (needsAuth && !username) page = null;
  else if (subMatch) page = <SubscriptionPage id={Number(subMatch[1])} />;
  else if (pathname === "/subscriptions" || pathname === "/subscriptions/") page = <SubscriptionsPage search={search} />;
  else page = <PublicPage />;

  const navLink = (href: string, label: string) => {
    const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
    return (
      <Link
        href={href}
        className={`rounded-md px-3 py-2 text-sm font-medium ${active ? "bg-slate-800 text-white" : "text-slate-300 hover:bg-slate-700 hover:text-white"}`}
      >
        {label}
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-slate-900">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-lg font-bold text-white">
              Billing Console
            </Link>
            <nav className="flex gap-1">
              {navLink("/", "Summary")}
              {username && navLink("/subscriptions", "Subscriptions")}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            {username ? (
              <>
                <span className="text-sm text-slate-300">
                  Signed in as <strong className="text-white" data-testid="current-user">{username}</strong>
                </span>
                <Button variant="secondary" onClick={signOut}>
                  Sign out
                </Button>
              </>
            ) : (
              <>
                {navLink("/login", "Sign in")}
                {navLink("/register", "Register")}
              </>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{page}</main>
    </div>
  );
}

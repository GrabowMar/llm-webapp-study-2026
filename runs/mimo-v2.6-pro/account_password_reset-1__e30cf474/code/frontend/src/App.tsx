import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { Account } from "./api";
import { api, getToken, setToken } from "./api";
import { navigate, useLocation } from "./router";
import { buttonClass, secondaryButtonClass } from "./components/ui";
import AccountPage from "./pages/AccountPage";
import ForgotPage from "./pages/ForgotPage";
import LoginPage from "./pages/LoginPage";
import MailboxPage from "./pages/MailboxPage";
import RegisterPage from "./pages/RegisterPage";
import ResetPage from "./pages/ResetPage";

const navLinkClass =
  "rounded px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900";

export default function App() {
  const location = useLocation();
  const [user, setUser] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      setUser(await api<Account>("/api/me"));
    } catch {
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  function signOut() {
    void api("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setToken(null);
    setUser(null);
    navigate("/login");
  }

  const path = location.path.replace(/\/+$/, "") || "/";

  let page: ReactNode;
  if (loading) {
    page = (
      <p className="mt-16 text-center text-slate-500">Loading…</p>
    );
  } else {
    switch (path) {
      case "/":
      case "/login":
        page = user ? (
          <AccountPage key={user.id} user={user} onUserChanged={setUser} />
        ) : (
          <LoginPage onSignedIn={setUser} />
        );
        break;
      case "/register":
        page = <RegisterPage onSignedIn={setUser} />;
        break;
      case "/forgot":
        page = <ForgotPage />;
        break;
      case "/reset":
        page = <ResetPage />;
        break;
      case "/account":
        page = (
          <AccountPage key={user?.id ?? "anon"} user={user} onUserChanged={setUser} />
        );
        break;
      case "/mailbox":
        page = <MailboxPage key={user?.id ?? "anon"} user={user} />;
        break;
      default:
        page = (
          <div className="mx-auto max-w-md text-center">
            <h2 className="text-xl font-semibold text-slate-900">
              Page not found
            </h2>
            <p className="mt-2 text-slate-600">Nothing lives at {path}.</p>
            <button
              className={`${buttonClass} mt-4`}
              onClick={() => navigate(user ? "/account" : "/login")}
            >
              Go home
            </button>
          </div>
        );
    }
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2 px-4 py-3">
          <button
            className="mr-auto text-lg font-semibold text-slate-900"
            onClick={() => navigate(user ? "/account" : "/login")}
          >
            Account service
          </button>
          <nav className="flex items-center gap-1">
            <button className={navLinkClass} onClick={() => navigate("/mailbox")}>
              Mailbox
            </button>
            {user ? (
              <button className={navLinkClass} onClick={() => navigate("/account")}>
                Account
              </button>
            ) : null}
          </nav>
          {user ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-600">
                Signed in as{" "}
                <span className="font-medium text-slate-900">{user.username}</span>
              </span>
              <button className={secondaryButtonClass} onClick={signOut}>
                Sign out
              </button>
            </div>
          ) : (
            <button
              className={secondaryButtonClass}
              onClick={() => navigate("/login")}
            >
              Sign in
            </button>
          )}
        </div>
      </header>
      <main className="px-4 py-8">{page}</main>
    </div>
  );
}

import { useEffect, useState } from "react";
import { api, clearToken, getToken, type Account } from "./api";
import AccountPage from "./pages/AccountPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import MailboxPage from "./pages/MailboxPage";
import NotFoundPage from "./pages/NotFoundPage";
import RegisterPage from "./pages/RegisterPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import { Link, navigate, useLocation } from "./router";
import { secondaryButtonClass } from "./ui";

function Header({
  account,
  onSignOut,
}: {
  account: Account | null;
  onSignOut: () => void;
}) {
  const navLink =
    "rounded px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900";
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-2 gap-y-1 px-4 py-3">
        <Link
          to="/"
          className="mr-2 rounded px-1 py-1 text-base font-bold text-slate-900 hover:text-sky-700"
        >
          Account Service
        </Link>
        <nav className="flex flex-wrap items-center gap-1">
          <Link to="/mailbox" className={navLink}>
            Mailbox
          </Link>
          <Link to="/forgot" className={navLink}>
            Forgot password?
          </Link>
          {account ? (
            <>
              <Link to="/account" className={navLink}>
                Account
              </Link>
              <span className="px-3 py-2 text-sm font-medium text-slate-500">
                {account.username}
              </span>
              <button
                type="button"
                onClick={onSignOut}
                className={secondaryButtonClass}
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className={navLink}>
                Sign in
              </Link>
              <Link to="/register" className={navLink}>
                Register
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

export default function App() {
  const location = useLocation();
  const pathname = location.split("?")[0];
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!getToken()) {
      setLoading(false);
      return;
    }
    api<Account>("/api/me")
      .then((result) => {
        if (cancelled) return;
        if (result.status === 200 && result.data) {
          setAccount(result.data);
        } else {
          clearToken();
        }
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        clearToken();
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const signedIn = (next: Account) => {
    setAccount(next);
    navigate("/account");
  };

  const signOut = () => {
    clearToken();
    setAccount(null);
    navigate("/login");
  };

  let page;
  if (loading) {
    page = (
      <p className="py-16 text-center text-sm text-slate-500">Loading…</p>
    );
  } else if (pathname === "/") {
    page = <HomePage account={account} />;
  } else if (pathname === "/login") {
    page = <LoginPage onSignedIn={signedIn} />;
  } else if (pathname === "/register") {
    page = <RegisterPage />;
  } else if (pathname === "/forgot") {
    page = <ForgotPasswordPage />;
  } else if (pathname === "/reset") {
    page = <ResetPasswordPage />;
  } else if (pathname === "/account") {
    page = (
      <AccountPage account={account} onAccountUpdated={setAccount} />
    );
  } else if (pathname === "/mailbox") {
    page = <MailboxPage account={account} />;
  } else {
    page = <NotFoundPage />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Header account={account} onSignOut={signOut} />
      <main className="mx-auto max-w-4xl px-4 py-8">{page}</main>
      <footer className="mx-auto max-w-4xl px-4 pb-8 text-center text-xs text-slate-400">
        Password reset demo — mail is stored in an outbox instead of being sent.
      </footer>
    </div>
  );
}

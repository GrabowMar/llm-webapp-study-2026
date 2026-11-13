import { useCallback, useEffect, useState } from "react";
import type { Account } from "./api";
import { messageFrom, request } from "./api";
import AccountPage from "./AccountPage";
import AdminPage from "./AdminPage";
import SignInForms from "./SignInForms";

type View = "account" | "admin";
type Status = "loading" | "ready" | "error";

const TOKEN_KEY = "token";

function navButton(active: boolean, onClick: () => void, label: string) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
        active
          ? "bg-slate-900 text-white"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      }`}
    >
      {label}
    </button>
  );
}

export default function App() {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem(TOKEN_KEY),
  );
  const [user, setUser] = useState<Account | null>(null);
  const [view, setView] = useState<View>("account");
  const [status, setStatus] = useState<Status>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);

  const signOut = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
    setView("account");
    setStatus("ready");
    setLoadError(null);
  }, []);

  useEffect(() => {
    if (!token) {
      setUser(null);
      setStatus("ready");
      setLoadError(null);
      return;
    }
    let cancelled = false;
    setStatus("loading");
    void request<Account>("/api/me", { token }).then((result) => {
      if (cancelled) {
        return;
      }
      if (result.status === 200 && result.data) {
        setUser(result.data);
        setLoadError(null);
        setStatus("ready");
        return;
      }
      if (result.status === 401) {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setUser(null);
        setStatus("ready");
        return;
      }
      setLoadError(messageFrom(result));
      setStatus("error");
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const signedIn = token !== null && user !== null;

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
        <SignInForms
          onSignedIn={(next) => {
            localStorage.setItem(TOKEN_KEY, next);
            setView("account");
            setToken(next);
          }}
        />
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="text-sm text-slate-500">Loading...</p>
      </div>
    );
  }

  if (status === "error" || !signedIn) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg ring-1 ring-slate-200">
          <p className="text-sm text-red-700">
            {loadError ?? "Your session could not be loaded."}
          </p>
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={signOut}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              Sign out
            </button>
            <button
              type="button"
              onClick={() => setToken(token)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isAdmin = user.username === "admin";

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-4">
            <span className="text-lg font-semibold text-slate-900">
              Accounts
            </span>
            <nav className="flex gap-1">
              {navButton(view === "account", () => setView("account"), "Account")}
              {isAdmin &&
                navButton(view === "admin", () => setView("admin"), "Admin")}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-600">
              Signed in as{" "}
              <span className="font-semibold text-slate-900">
                {user.username}
              </span>
            </span>
            <button
              type="button"
              onClick={signOut}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        {view === "admin" && isAdmin ? (
          <AdminPage token={token} onUnauthorized={signOut} />
        ) : (
          <AccountPage user={user} token={token} onUnauthorized={signOut} />
        )}
      </main>
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { api, session, setUnauthorizedHandler } from "./api";
import AuthForms from "./AuthForms";
import PublicPage from "./PublicPage";
import SubscriptionDetail from "./SubscriptionDetail";
import SubscriptionList from "./SubscriptionList";

function parseHash(): string {
  return window.location.hash.replace(/^#/, "") || "/";
}

export default function App() {
  const [user, setUser] = useState<string | null>(session.user() && session.token() ? session.user() : null);
  const [route, setRoute] = useState(parseHash());

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const signOut = useCallback(() => {
    session.clear();
    setUser(null);
    window.location.hash = "#/";
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(signOut);
  }, [signOut]);

  async function logout() {
    try {
      await api("POST", "/auth/logout");
    } catch {
      // token already invalid
    }
    signOut();
  }

  const go = (path: string) => {
    window.location.hash = `#${path}`;
  };

  const detail = /^\/subscriptions\/(\d+)$/.exec(route);
  let page;
  if (route === "/login") {
    page = user ? <SubscriptionList onOpen={(id) => go(`/subscriptions/${id}`)} /> : (
      <AuthForms
        onSignedIn={(u) => {
          setUser(u);
          go("/subscriptions");
        }}
      />
    );
  } else if (route.startsWith("/subscriptions")) {
    if (!user) page = (
      <AuthForms
        onSignedIn={(u) => {
          setUser(u);
        }}
      />
    );
    else if (detail) page = <SubscriptionDetail key={detail[1]} id={Number(detail[1])} onBack={() => go("/subscriptions")} />;
    else page = <SubscriptionList onOpen={(id) => go(`/subscriptions/${id}`)} />;
  } else {
    page = <PublicPage />;
  }

  const link = "text-sm font-medium text-slate-700 hover:text-indigo-600";
  return (
    <div className="min-h-screen text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <nav className="flex items-center gap-4">
            <span className="font-bold text-indigo-700">Billing console</span>
            <a className={link} href="#/">
              Summary
            </a>
            {user && (
              <a className={link} href="#/subscriptions">
                Subscriptions
              </a>
            )}
          </nav>
          <div className="flex items-center gap-3 text-sm">
            {user ? (
              <>
                <span data-testid="current-user">{user}</span>
                <button
                  className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-100"
                  onClick={logout}
                >
                  Sign out
                </button>
              </>
            ) : (
              <a className={link} href="#/login">
                Sign in / Register
              </a>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{page}</main>
    </div>
  );
}

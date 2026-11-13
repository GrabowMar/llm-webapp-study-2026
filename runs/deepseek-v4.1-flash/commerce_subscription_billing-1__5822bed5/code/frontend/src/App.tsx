import { useEffect, useState } from "react";
import { api, getToken, setToken } from "./api";
import { usePath } from "./router";
import { PublicPage } from "./pages/PublicPage";
import { SubscriptionsPage } from "./pages/SubscriptionsPage";
import { SubscriptionPage } from "./pages/SubscriptionPage";
import { AuthPage } from "./pages/AuthPage";

export default function App() {
  const [path, navigate] = usePath();
  const [username, setUsername] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      setReady(true);
      return;
    }
    api<{ username: string }>("/me")
      .then((u) => setUsername(u.username))
      .catch(() => setToken(null))
      .finally(() => setReady(true));
  }, []);

  const signOut = async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    setToken(null);
    setUsername(null);
    navigate("/");
  };

  if (!ready) {
    return <div className="p-8 text-sm text-slate-500">Loading…</div>;
  }

  const subMatch = path.match(/^\/subscriptions\/(\d+)$/);

  let page;
  if (path === "/login" || path === "/register") {
    page = (
      <AuthPage
        mode={path === "/register" ? "register" : "login"}
        onSignedIn={(name) => {
          setUsername(name);
          navigate("/subscriptions");
        }}
      />
    );
  } else if (!username) {
    page = <PublicPage onSignIn={() => navigate("/login")} />;
  } else if (subMatch) {
    page = <SubscriptionPage id={Number(subMatch[1])} navigate={navigate} />;
  } else if (path === "/subscriptions") {
    page = <SubscriptionsPage navigate={navigate} />;
  } else {
    page = <PublicPage onSignIn={() => navigate("/login")} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <button
            onClick={() => navigate(username ? "/subscriptions" : "/")}
            className="text-lg font-semibold tracking-tight text-slate-900"
          >
            Billing Console
          </button>
          <nav className="flex items-center gap-4 text-sm">
            <a href="/" onClick={handleNav(navigate, "/")} className="text-slate-600 hover:text-slate-900">
              Public
            </a>
            {username ? (
              <>
                <a
                  href="/subscriptions"
                  onClick={handleNav(navigate, "/subscriptions")}
                  className="text-slate-600 hover:text-slate-900"
                >
                  Subscriptions
                </a>
                <span className="text-slate-500">
                  Signed in as <span className="font-medium text-slate-800">{username}</span>
                </span>
                <button
                  onClick={signOut}
                  className="rounded-md border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-100"
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <a
                  href="/login"
                  onClick={handleNav(navigate, "/login")}
                  className="text-slate-600 hover:text-slate-900"
                >
                  Sign in
                </a>
                <a
                  href="/register"
                  onClick={handleNav(navigate, "/register")}
                  className="rounded-md bg-slate-900 px-3 py-1.5 font-medium text-white hover:bg-slate-700"
                >
                  Register
                </a>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{page}</main>
    </div>
  );
}

function handleNav(navigate: (p: string) => void, path: string) {
  return (e: React.MouseEvent) => {
    e.preventDefault();
    navigate(path);
  };
}

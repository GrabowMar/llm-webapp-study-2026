import { useCallback, useEffect, useState } from "react";
import { authApi, clearSession, getToken, getUsername } from "./api";
import AuthView from "./AuthView";
import DetailView from "./DetailView";
import PublicView from "./PublicView";
import SubscriptionsView from "./SubscriptionsView";
import { Button } from "./components";

type Route =
  | { name: "public" }
  | { name: "auth" }
  | { name: "list" }
  | { name: "detail"; id: number };

function routeFromHash(signedIn: boolean): Route {
  const hash = window.location.hash.replace(/^#\/?/, "");
  const match = /^subscriptions\/(\d+)$/.exec(hash);
  if (signedIn && match) return { name: "detail", id: Number(match[1]) };
  if (signedIn && hash === "subscriptions") return { name: "list" };
  if (hash === "signin") return { name: "auth" };
  return signedIn ? { name: "list" } : { name: "public" };
}

function hashFor(route: Route): string {
  switch (route.name) {
    case "detail":
      return `#/subscriptions/${route.id}`;
    case "list":
      return "#/subscriptions";
    case "auth":
      return "#/signin";
    case "public":
      return "#/";
  }
}

export default function App() {
  const [signedIn, setSignedIn] = useState(() => Boolean(getToken()));
  const [username, setUsername] = useState(() => getUsername() ?? "");
  const [route, setRoute] = useState<Route>(() => routeFromHash(Boolean(getToken())));
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const onHashChange = () => setRoute(routeFromHash(Boolean(getToken())));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async (...args: Parameters<typeof originalFetch>) => {
      const response = await originalFetch(...args);
      const url =
        typeof args[0] === "string"
          ? args[0]
          : args[0] instanceof URL
            ? args[0].href
            : args[0].url;
      if (
        response.status === 401 &&
        url.includes("/api/") &&
        !url.includes("/auth/login") &&
        !url.includes("/auth/register") &&
        getToken()
      ) {
        clearSession();
        setSignedIn(false);
        setUsername("");
        window.location.hash = "#/";
        setRoute({ name: "public" });
      }
      return response;
    };
    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  const navigate = useCallback((next: Route) => {
    const hash = hashFor(next);
    if (window.location.hash !== hash) window.location.hash = hash;
    else setRoute(next);
  }, []);

  function onSignedIn(name: string) {
    setSignedIn(true);
    setUsername(name);
    navigate({ name: "list" });
  }

  async function signOut() {
    setSigningOut(true);
    await authApi.logout();
    clearSession();
    setSignedIn(false);
    setUsername("");
    setSigningOut(false);
    navigate({ name: "public" });
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <button
            onClick={() => navigate(signedIn ? { name: "list" } : { name: "public" })}
            className="flex items-center gap-2 text-left"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
              B
            </span>
            <span className="text-sm font-bold tracking-tight text-slate-900">
              Billing Console
            </span>
          </button>
          <div className="flex items-center gap-3">
            {signedIn ? (
              <>
                <button
                  onClick={() => navigate({ name: "list" })}
                  className={`text-sm font-medium transition ${
                    route.name === "list" || route.name === "detail"
                      ? "text-indigo-700"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Subscriptions
                </button>
                <span className="hidden text-xs text-slate-400 sm:inline">·</span>
                <span className="text-sm text-slate-600">
                  Signed in as{" "}
                  <strong className="font-semibold text-slate-800">{username}</strong>
                </span>
                <Button variant="secondary" onClick={signOut} disabled={signingOut}>
                  {signingOut ? "Signing out…" : "Sign out"}
                </Button>
              </>
            ) : (
              <button
                onClick={() => navigate({ name: "auth" })}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
              >
                Sign in
              </button>
            )}
          </div>
        </div>
      </header>

      {!signedIn && route.name === "auth" && (
        <AuthView onSignedIn={onSignedIn} />
      )}
      {!signedIn && route.name !== "auth" && (
        <PublicView onSignIn={() => navigate({ name: "auth" })} />
      )}
      {signedIn && (route.name === "list" || route.name === "public" || route.name === "auth") && (
        <SubscriptionsView onOpen={(id) => navigate({ name: "detail", id })} />
      )}
      {signedIn && route.name === "detail" && (
        <DetailView id={route.id} onBack={() => navigate({ name: "list" })} />
      )}
    </div>
  );
}

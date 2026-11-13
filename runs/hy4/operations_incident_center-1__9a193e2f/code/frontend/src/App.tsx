import { useCallback, useEffect, useState } from "react";
import { api, clearSession, getToken, getUsername, saveSession } from "./api";
import { Button } from "./components";
import AuthView from "./views/AuthView";
import IncidentView from "./views/IncidentView";
import IncidentsView from "./views/IncidentsView";
import OpenIncidentView from "./views/OpenIncidentView";
import PublicView from "./views/PublicView";

export type Route =
  | { name: "public" }
  | { name: "incidents" }
  | { name: "incident"; id: number }
  | { name: "open" }
  | { name: "auth" };

export type Navigate = (route: Route) => void;

function parseRoute(path: string): Route {
  const clean = path.replace(/\/+$/, "") || "/";
  const match = clean.match(/^\/incidents\/(\d+)$/);
  if (match) return { name: "incident", id: Number(match[1]) };
  if (clean === "/incidents/new") return { name: "open" };
  if (clean === "/incidents") return { name: "incidents" };
  return { name: "public" };
}

function routePath(route: Route): string {
  switch (route.name) {
    case "incidents":
      return "/incidents";
    case "incident":
      return `/incidents/${route.id}`;
    case "open":
      return "/incidents/new";
    case "auth":
      return "/signin";
    default:
      return "/";
  }
}

const MEMBER_NAV: { label: string; route: Route }[] = [
  { label: "Incidents", route: { name: "incidents" } },
  { label: "Open incident", route: { name: "open" } },
];

export default function App() {
  const [username, setUsername] = useState<string | null>(() => getUsername());
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname));

  const navigate = useCallback<Navigate>((next) => {
    const target = next.name === "auth" && !username ? parseRoute(window.location.pathname) : next;
    window.history.pushState({}, "", routePath(target));
    setRoute(target);
    window.scrollTo({ top: 0 });
  }, [username]);

  useEffect(() => {
    const onPop = () => setRoute(parseRoute(window.location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (!getToken()) return;
    api.me()
      .then((result) => {
        saveSession(getToken()!, result.username);
        setUsername(result.username);
      })
      .catch(() => {
        clearSession();
        setUsername(null);
      });
  }, []);

  const needsAuth =
    route.name === "incidents" || route.name === "incident" || route.name === "open";
  useEffect(() => {
    if (!username && needsAuth) navigate({ name: "auth" });
  }, [username, needsAuth, navigate]);

  function onAuthenticated(nextUsername: string) {
    setUsername(nextUsername);
    navigate({ name: "incidents" });
  }

  function signOut() {
    clearSession();
    setUsername(null);
    navigate({ name: "public" });
  }

  if (route.name === "auth" && !username) {
    return <AuthView onAuthenticated={onAuthenticated} onBack={() => navigate({ name: "public" })} />;
  }

  const active = (item: Route) =>
    item.name === "public"
      ? route.name === "public"
      : item.name === "incidents"
        ? route.name === "incidents" || route.name === "incident"
        : route.name === item.name;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <button
              onClick={() => navigate({ name: "public" })}
              className="text-left text-base font-bold tracking-tight text-slate-900 hover:text-indigo-600"
            >
              Incident Center
            </button>
          </div>

          <nav className="flex flex-wrap items-center gap-1">
            <button
              onClick={() => navigate({ name: "public" })}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                active({ name: "public" })
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              Public
            </button>
            {username && MEMBER_NAV.map((item) => (
              <button
                key={item.label}
                onClick={() => navigate(item.route)}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                  active(item.route)
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            {username ? (
              <>
                <span className="hidden text-sm text-slate-500 sm:inline">Signed in as</span>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-800">{username}</span>
                <Button variant="secondary" onClick={signOut} className="!px-3 !py-1.5">
                  Sign out
                </Button>
              </>
            ) : (
              <>
                <Button variant="secondary" onClick={() => navigate({ name: "auth" })} className="!px-3 !py-1.5">
                  Sign in
                </Button>
                <Button onClick={() => navigate({ name: "auth" })} className="!px-3 !py-1.5">
                  Register
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {route.name === "public" && <PublicView navigate={navigate} signedIn={!!username} />}
        {username && route.name === "incidents" && <IncidentsView navigate={navigate} />}
        {username && route.name === "incident" && <IncidentView id={route.id} navigate={navigate} />}
        {username && route.name === "open" && <OpenIncidentView navigate={navigate} />}
        {!username && needsAuth && (
          <div className="mx-auto max-w-md py-16 text-center">
            <p className="text-sm text-slate-600">Please sign in to view incident details.</p>
            <Button className="mt-4" onClick={() => navigate({ name: "auth" })}>Sign in</Button>
          </div>
        )}
      </main>

      <footer className="mx-auto max-w-6xl px-4 pb-10 pt-4 text-center text-xs text-slate-400 sm:px-6">
        Incident Center · Operations console · Public figures only for anonymous visitors
      </footer>
    </div>
  );
}

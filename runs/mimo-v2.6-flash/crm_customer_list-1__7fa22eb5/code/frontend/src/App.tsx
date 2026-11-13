import { useEffect, useState } from "react";
import { clearSession, getToken, getUsername, setUnauthorizedHandler } from "./api";
import AuthScreen from "./components/AuthScreen";
import CustomerDetail from "./components/CustomerDetail";
import CustomerList from "./components/CustomerList";

type Route = { name: "list" } | { name: "customer"; id: number };

function parseRoute(): Route {
  const match = window.location.pathname.match(/^\/customers\/(\d+)\/?$/);
  if (match) return { name: "customer", id: Number(match[1]) };
  return { name: "list" };
}

export function navigate(path: string): void {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export default function App() {
  const [route, setRoute] = useState<Route>(parseRoute);
  const [signedIn, setSignedIn] = useState<boolean>(() => getToken() !== null);
  const [username, setUsername] = useState<string>(() => getUsername() ?? "");

  useEffect(() => {
    const onPopState = () => setRoute(parseRoute());
    window.addEventListener("popstate", onPopState);
    setUnauthorizedHandler(() => {
      clearSession();
      setUsername("");
      setSignedIn(false);
    });
    return () => {
      window.removeEventListener("popstate", onPopState);
      setUnauthorizedHandler(null);
    };
  }, []);

  function signOut(): void {
    clearSession();
    setUsername("");
    setSignedIn(false);
    navigate("/");
  }

  if (!signedIn) {
    return (
      <AuthScreen
        onSignedIn={(name) => {
          setUsername(name);
          setSignedIn(true);
          if (route.name === "customer") navigate("/");
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="text-left text-lg font-semibold tracking-tight text-slate-900 hover:text-indigo-600"
          >
            Customer Directory
          </button>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-slate-500 sm:inline">
              Signed in as <span className="font-medium text-slate-700">{username}</span>
            </span>
            <button
              type="button"
              onClick={signOut}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        {route.name === "list" ? <CustomerList /> : <CustomerDetail id={route.id} />}
      </main>
    </div>
  );
}

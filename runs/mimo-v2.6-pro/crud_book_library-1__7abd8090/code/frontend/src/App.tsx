import { useState } from "react";

import { clearAuth, getToken, getStoredUsername } from "./api";
import BookDetail from "./pages/BookDetail";
import BookForm from "./pages/BookForm";
import BookList from "./pages/BookList";
import Login from "./pages/Login";
import Register from "./pages/Register";
import type { Auth, Route } from "./route";

export default function App() {
  const [auth, setAuth] = useState<Auth | null>(() =>
    getToken() ? { username: getStoredUsername() ?? "" } : null,
  );
  const [route, setRoute] = useState<Route>({ name: "list" });

  function navigate(next: Route) {
    setRoute(next);
    window.scrollTo(0, 0);
  }

  function signOut() {
    clearAuth();
    setAuth(null);
    navigate({ name: "list" });
  }

  let content;
  switch (route.name) {
    case "list":
      content = <BookList auth={auth} navigate={navigate} />;
      break;
    case "book":
      content = <BookDetail bookId={route.id} auth={auth} navigate={navigate} />;
      break;
    case "add":
      content = <BookForm navigate={navigate} />;
      break;
    case "edit":
      content = <BookForm bookId={route.id} navigate={navigate} />;
      break;
    case "login":
      content = <Login navigate={navigate} onSignedIn={setAuth} />;
      break;
    case "register":
      content = <Register navigate={navigate} onSignedIn={setAuth} />;
      break;
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="bg-white shadow">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <button
            className="text-xl font-bold text-indigo-700"
            onClick={() => navigate({ name: "list" })}
          >
            Book Library
          </button>
          <nav className="flex flex-wrap items-center gap-3">
            {auth ? (
              <>
                <span className="text-sm text-slate-600">
                  Signed in as <span className="font-semibold">{auth.username}</span>
                </span>
                <button
                  className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  onClick={signOut}
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <button
                  className="rounded px-3 py-1.5 text-sm font-medium text-indigo-700 hover:underline"
                  onClick={() => navigate({ name: "login" })}
                >
                  Sign in
                </button>
                <button
                  className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  onClick={() => navigate({ name: "register" })}
                >
                  Register
                </button>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6">{content}</main>
    </div>
  );
}

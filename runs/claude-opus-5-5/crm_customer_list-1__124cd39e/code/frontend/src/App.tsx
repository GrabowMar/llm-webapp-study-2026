import { useEffect, useState } from "react";
import { api, session, setUnauthorizedHandler } from "./api";
import { Button, Link, buttonClass } from "./components/ui";
import AuthPage from "./pages/AuthPage";
import CustomerDetail from "./pages/CustomerDetail";
import CustomerForm from "./pages/CustomerForm";
import CustomerList from "./pages/CustomerList";
import { matchRoute, useLocation } from "./router";

export default function App() {
  const [username, setUsername] = useState<string | null>(() => (session.token() ? session.username() ?? "" : null));
  const { pathname, search } = useLocation();

  useEffect(() => {
    setUnauthorizedHandler(() => {
      session.clear();
      setUsername(null);
    });
  }, []);

  if (username === null) return <AuthPage onSignedIn={setUsername} />;

  async function signOut() {
    try {
      await api.logout();
    } catch {
      /* ignore */
    }
    session.clear();
    setUsername(null);
  }

  const route = matchRoute(pathname);
  let page;
  switch (route.name) {
    case "list":
      page = <CustomerList search={search} />;
      break;
    case "new":
      page = <CustomerForm key="new" />;
      break;
    case "detail":
      page = <CustomerDetail key={route.id} id={route.id} />;
      break;
    case "edit":
      page = <CustomerForm key={`edit-${route.id}`} id={route.id} />;
      break;
    default:
      page = (
        <div className="py-16 text-center">
          <h1 className="text-2xl font-bold text-slate-900">Page not found</h1>
          <Link to="/" className={`${buttonClass("secondary")} mt-6`}>
            Back to customers
          </Link>
        </div>
      );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link to="/" className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-indigo-600 font-bold text-white">C</span>
            <span className="font-semibold tracking-tight text-slate-900">Customer Directory</span>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            {username && (
              <span className="hidden text-slate-500 sm:inline">
                Signed in as <span className="font-medium text-slate-800">{username}</span>
              </span>
            )}
            <Button variant="secondary" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{page}</main>
    </div>
  );
}

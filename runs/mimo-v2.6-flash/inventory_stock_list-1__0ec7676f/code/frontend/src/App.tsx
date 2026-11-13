import { useEffect, useState, type ReactNode } from "react";
import Link, { navigate } from "./router";
import { clearSession, getToken, getUsername, setSession } from "./api";
import Header from "./components/Header";
import InventoryPage from "./pages/InventoryPage";
import ItemDetailPage from "./pages/ItemDetailPage";
import ItemFormPage from "./pages/ItemFormPage";
import AuthPage from "./pages/AuthPage";

type Route =
  | { name: "list" }
  | { name: "login" }
  | { name: "register" }
  | { name: "newItem" }
  | { name: "item"; id: number }
  | { name: "editItem"; id: number }
  | { name: "notFound" };

function parseRoute(pathname: string): Route {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return { name: "list" };
  if (parts[0] === "login" && parts.length === 1) return { name: "login" };
  if (parts[0] === "register" && parts.length === 1) return { name: "register" };
  if (parts[0] === "items") {
    if (parts.length === 1) return { name: "list" };
    if (parts[1] === "new" && parts.length === 2) return { name: "newItem" };
    const id = Number(parts[2]);
    if (parts.length === 3 && Number.isInteger(id) && id > 0) {
      return { name: "item", id };
    }
    if (parts.length === 4 && parts[3] === "edit") {
      const editId = Number(parts[2]);
      if (Number.isInteger(editId) && editId > 0) return { name: "editItem", id: editId };
    }
  }
  return { name: "notFound" };
}

export default function App() {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname));
  const [user, setUser] = useState<string | null>(() =>
    getToken() ? getUsername() : null,
  );

  useEffect(() => {
    const sync = () => setRoute(parseRoute(window.location.pathname));
    const session = () => setUser(getToken() ? getUsername() : null);
    window.addEventListener("popstate", sync);
    window.addEventListener("navigation", sync);
    window.addEventListener("session-changed", session);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("navigation", sync);
      window.removeEventListener("session-changed", session);
    };
  }, []);

  const signIn = (token: string, username: string) => {
    setSession(token, username);
    setUser(username);
  };

  const signOut = () => {
    clearSession();
    setUser(null);
    navigate("/");
  };

  let page: ReactNode;
  switch (route.name) {
    case "list":
      page = <InventoryPage user={user} />;
      break;
    case "login":
      page = <AuthPage mode="login" user={user} onSignIn={signIn} />;
      break;
    case "register":
      page = <AuthPage mode="register" user={user} onSignIn={signIn} />;
      break;
    case "newItem":
      page = <ItemFormPage mode="create" user={user} />;
      break;
    case "item":
      page = <ItemDetailPage id={route.id} user={user} />;
      break;
    case "editItem":
      page = <ItemFormPage mode="edit" id={route.id} user={user} />;
      break;
    default:
      page = (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
          <p className="text-lg font-semibold">Page not found</p>
          <Link to="/" className="mt-3 inline-block text-sky-700 hover:underline">
            Back to inventory
          </Link>
        </div>
      );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <Header user={user} onSignOut={signOut} />
      <main className="mx-auto w-full max-w-5xl px-4 py-6">{page}</main>
    </div>
  );
}

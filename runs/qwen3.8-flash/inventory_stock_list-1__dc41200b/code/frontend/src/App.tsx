import { useEffect, useState } from "react";
import { getToken, getUsername, listItems, logout as apiLogout } from "./api";
import type { Item, ItemsPage } from "./api";
import AuthPage from "./AuthPage";
import ItemList from "./ItemList";
import ItemPage from "./ItemPage";
import ItemForm from "./ItemForm";

export type Route =
  | { name: "list" }
  | { name: "item"; id: number }
  | { name: "new" }
  | { name: "edit"; id: number };

export function parseHash(): Route {
  const hash = window.location.hash.replace(/^#\/?/, "");
  const parts = hash.split("/").filter(Boolean);
  if (parts[0] === "items" && parts[1]) {
    const id = Number(parts[1]);
    if (!Number.isNaN(id)) {
      if (parts[2] === "edit") return { name: "edit", id };
      return { name: "item", id };
    }
  }
  if (parts[0] === "new") return { name: "new" };
  return { name: "list" };
}

export function navigate(path: string) {
  window.location.hash = path;
}

const inputCls =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

export { inputCls };

export default function App() {
  const [route, setRoute] = useState<Route>(parseHash());
  const [authed, setAuthed] = useState<boolean>(() => Boolean(getToken()));
  const [username, setUsername] = useState<string | null>(() => getUsername());
  const [locations, setLocations] = useState<string[]>([]);

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener("hashchange", onHash);
    const onUnauthorized = () => {
      setAuthed(false);
      setUsername(null);
    };
    window.addEventListener("inventory:unauthorized", onUnauthorized);
    return () => {
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener("inventory:unauthorized", onUnauthorized);
    };
  }, []);

  useEffect(() => {
    listItems({ page_size: 100 })
      .then((page: ItemsPage) => {
        const set = new Set<string>();
        page.items.forEach((it: Item) => {
          if (it.location) set.add(it.location);
        });
        setLocations(Array.from(set).sort((a, b) => a.localeCompare(b)));
      })
      .catch(() => undefined);
  }, [route, authed]);

  if (!authed) {
    return (
      <AuthPage
        onSignedIn={(name) => {
          setAuthed(true);
          setUsername(name);
        }}
      />
    );
  }

  const signOut = async () => {
    await apiLogout();
    setAuthed(false);
    setUsername(null);
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800">
      <header className="border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <a href="#/" className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-indigo-600 text-sm text-white">
              WI
            </span>
            Warehouse Inventory
          </a>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-500">
              Signed in as <strong className="text-slate-800">{username}</strong>
            </span>
            <button
              onClick={signOut}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        {route.name === "list" && (
          <ItemList
            locations={locations}
            onLocationsChange={setLocations}
          />
        )}
        {route.name === "item" && <ItemPage id={route.id} />}
        {route.name === "new" && (
          <ItemForm mode="new" onSaved={(item) => navigate(`/items/${item.id}`)} />
        )}
        {route.name === "edit" && <ItemForm mode="edit" id={route.id} />}
      </main>
    </div>
  );
}

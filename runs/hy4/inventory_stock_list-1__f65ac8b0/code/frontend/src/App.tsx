import { useEffect, useState } from "react";
import AuthPanel from "./AuthPanel";
import InventoryList from "./InventoryList";
import ItemDetail from "./ItemDetail";
import ItemForm from "./ItemForm";
import { api, clearSession, getToken, getUsername } from "./api";
import type { ApiError, Item } from "./api";
import { Button, Card } from "./ui";

type View =
  | { kind: "list" }
  | { kind: "detail"; id: number }
  | { kind: "add" }
  | { kind: "edit"; item: Item };

function readHash(): number | null {
  const match = window.location.hash.match(/^#\/items\/(\d+)$/);
  return match ? Number(match[1]) : null;
}

export default function App() {
  const [username, setUsername] = useState<string | null>(() => getUsername());
  const [authShown, setAuthShown] = useState<boolean | "login" | "register">(
    () => !getToken(),
  );
  const [view, setView] = useState<View>(() => {
    const id = readHash();
    return id ? { kind: "detail", id } : { kind: "list" };
  });

  useEffect(() => {
    if (!getToken()) return;
    api
      .me()
      .then((user) => setUsername(user.username))
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) {
          clearSession();
          setUsername(null);
          setAuthShown(true);
        }
      });
  }, []);

  useEffect(() => {
    const onHashChange = () => {
      const id = readHash();
      setView(id ? { kind: "detail", id } : { kind: "list" });
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    const target = view.kind === "detail" ? `#/items/${view.id}` : "";
    if (window.location.hash !== target) {
      if (target) window.location.hash = target;
      else if (window.location.hash) window.history.replaceState(null, "", " ");
    }
  }, [view]);

  function openItem(id: number) {
    setView({ kind: "detail", id });
  }

  function showList() {
    setView({ kind: "list" });
  }

  function signOut() {
    clearSession();
    setUsername(null);
    showList();
  }

  const signedIn = username !== null;

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <button
            type="button"
            onClick={showList}
            className="flex items-center gap-2 text-lg font-bold text-slate-900"
          >
            <span className="rounded-md bg-indigo-600 px-2 py-1 text-sm font-bold text-white">
              W
            </span>
            Warehouse Inventory
          </button>
          <div className="flex items-center gap-3">
            {signedIn ? (
              <>
                <span className="text-sm text-slate-600">
                  Signed in as <strong className="text-slate-900">{username}</strong>
                </span>
                <Button variant="secondary" onClick={signOut}>
                  Sign out
                </Button>
              </>
            ) : (
              <Button
                variant={authShown ? "ghost" : "secondary"}
                onClick={() => setAuthShown(true)}
              >
                Sign in / Register
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        {authShown && !signedIn ? (
          <AuthPanel
            mode={authShown === true ? "login" : authShown}
            onSignedIn={(name) => {
              setUsername(name);
              setAuthShown(false);
            }}
            onSwitch={(mode) =>
              mode === "browse" ? setAuthShown(false) : setAuthShown(mode)
            }
          />
        ) : (
          <>
            {!signedIn && (
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
                <span>You are browsing as a guest. Anyone can read items and movements.</span>
                <Button variant="secondary" onClick={() => setAuthShown("login")}>
                  Sign in to manage
                </Button>
              </div>
            )}

            {view.kind === "list" && (
              <InventoryList
                signedIn={signedIn}
                onOpen={openItem}
                onAdd={() =>
                  signedIn ? setView({ kind: "add" }) : setAuthShown("login")
                }
              />
            )}

            {view.kind === "detail" && (
              <ItemDetail
                itemId={view.id}
                signedIn={signedIn}
                onBack={showList}
                onEdit={(item) => setView({ kind: "edit", item })}
                onDeleted={showList}
              />
            )}

            {(view.kind === "add" || view.kind === "edit") && (
              <div className="mx-auto max-w-2xl">
                <Card title={view.kind === "add" ? "Add an item" : `Edit ${view.item.name}`}>
                  <ItemForm
                    item={view.kind === "edit" ? view.item : null}
                    onSaved={(item) => setView({ kind: "detail", id: item.id })}
                    onCancel={showList}
                  />
                </Card>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

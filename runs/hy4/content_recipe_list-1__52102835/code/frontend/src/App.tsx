import { useCallback, useEffect, useState } from "react";
import { api, ApiError, getToken, setToken } from "./api";
import { AuthPanel } from "./AuthPanel";
import { BrowseView } from "./BrowseView";
import { RecipeForm } from "./RecipeForm";
import { RecipeView } from "./RecipeView";
import { primaryBtn } from "./ui";

type View =
  | { name: "browse" }
  | { name: "recipe"; id: number }
  | { name: "add" }
  | { name: "edit"; id: number };

export default function App() {
  const [username, setUsername] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register" | null>(null);
  const [view, setView] = useState<View>({ name: "browse" });
  const [refreshKey, setRefreshKey] = useState(0);
  const [categories, setCategories] = useState<string[]>([]);

  useEffect(() => {
    if (!getToken()) {
      setAuthReady(true);
      return;
    }
    api
      .me()
      .then((user) => setUsername(user.username))
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) setToken(null);
      })
      .finally(() => setAuthReady(true));
  }, []);

  useEffect(() => {
    api
      .categories()
      .then(setCategories)
      .catch(() => setCategories([]));
  }, [refreshKey]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [view]);

  const refresh = useCallback(() => setRefreshKey((key) => key + 1), []);

  function openRecipe(id: number) {
    setView({ name: "recipe", id });
  }

  function requireAuth(action: () => void) {
    if (username) {
      action();
    } else {
      setAuthMode("login");
    }
  }

  function handleSignOut() {
    setToken(null);
    setUsername(null);
    if (view.name === "add" || view.name === "edit") setView({ name: "browse" });
  }

  function handleDeleted() {
    refresh();
    setView({ name: "browse" });
  }

  return (
    <div className="min-h-screen bg-amber-50">
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-white/90 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={() => setView({ name: "browse" })}
            className="flex items-center gap-2 text-left"
          >
            <span
              aria-hidden="true"
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-600 text-lg text-white shadow-sm"
            >
              🍳
            </span>
            <span className="text-lg font-extrabold tracking-tight text-stone-900">
              Recipe Book
            </span>
          </button>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {username && (
              <button
                type="button"
                className={primaryBtn}
                onClick={() => setView({ name: "add" })}
              >
                + Add recipe
              </button>
            )}
            {!username && !authReady ? (
              <span className="h-9 w-24 animate-pulse rounded-lg bg-stone-100" />
            ) : username ? (
              <>
                <span className="hidden text-sm text-stone-500 sm:inline">
                  Signed in as{" "}
                  <span className="font-semibold text-stone-800">{username}</span>
                </span>
                <span className="rounded-full bg-amber-100 px-3 py-1.5 text-sm font-semibold text-amber-800 sm:hidden">
                  {username}
                </span>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-700 shadow-sm transition hover:bg-stone-100"
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setAuthMode("login")}
                  className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-700 shadow-sm transition hover:bg-stone-100"
                >
                  Sign in
                </button>
                <button
                  type="button"
                  className={primaryBtn}
                  onClick={() => setAuthMode("register")}
                >
                  Register
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {view.name === "browse" && (
          <>
            <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="text-3xl font-extrabold tracking-tight text-stone-900 sm:text-4xl">
                  Find your next favourite dish
                </h1>
                <p className="mt-2 text-stone-500">
                  Browse recipes shared by our community of cooks.
                </p>
              </div>
              {!username && (
                <button
                  type="button"
                  className={primaryBtn}
                  onClick={() => requireAuth(() => setView({ name: "add" }))}
                >
                  + Share a recipe
                </button>
              )}
            </div>
            <BrowseView onOpenRecipe={openRecipe} refreshKey={refreshKey} />
          </>
        )}

        {view.name === "recipe" && (
          <RecipeView
            id={view.id}
            username={username}
            onBack={() => setView({ name: "browse" })}
            onEdit={(id) => setView({ name: "edit", id })}
            onDeleted={handleDeleted}
            onSignIn={() => setAuthMode("login")}
          />
        )}

        {(view.name === "add" || view.name === "edit") && (
          <RecipeForm
            recipeId={view.name === "edit" ? view.id : null}
            categories={categories}
            onCancel={() =>
              setView(
                view.name === "edit"
                  ? { name: "recipe", id: view.id }
                  : { name: "browse" },
              )
            }
            onSaved={(id) => {
              refresh();
              setView({ name: "recipe", id });
            }}
          />
        )}
      </main>

      <footer className="border-t border-stone-200 py-6 text-center text-xs text-stone-400">
        Recipe Book · Cook something wonderful today
      </footer>

      {authMode && (
        <AuthPanel
          mode={authMode}
          onSwitchMode={setAuthMode}
          onClose={() => setAuthMode(null)}
          onAuthenticated={(name) => {
            setUsername(name);
            setAuthMode(null);
          }}
        />
      )}
    </div>
  );
}

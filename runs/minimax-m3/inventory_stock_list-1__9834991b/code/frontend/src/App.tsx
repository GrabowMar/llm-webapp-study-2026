import { RouterProvider, useRouter } from "./router";
import { AuthProvider, useAuth } from "./auth";
import InventoryPage from "./pages/InventoryPage";
import ItemPage from "./pages/ItemPage";

function NotFound() {
  const { navigate } = useRouter();
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <h1 className="text-lg font-semibold text-slate-900">Page not found</h1>
      <button
        type="button"
        onClick={() => navigate("/")}
        className="mt-4 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
      >
        Back to inventory
      </button>
    </div>
  );
}

function Shell() {
  const { path, navigate } = useRouter();
  const { username, ready, logout } = useAuth();

  const focusSignIn = () => {
    const panel = document.getElementById("auth-panel");
    panel?.scrollIntoView({ behavior: "smooth", block: "center" });
    const field = document.getElementById("signin-username") as HTMLInputElement | null;
    field?.focus();
  };

  const itemMatch = /^\/items\/(\d+)\/?$/.exec(path);
  const isInventory = path === "/" || path === "/items" || path === "/items/";

  return (
    <div className="flex min-h-screen flex-col bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <a
            href="/"
            onClick={(event) => {
              event.preventDefault();
              navigate("/");
            }}
            className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
              IN
            </span>
            Warehouse Inventory
          </a>

          <div className="flex items-center gap-3">
            {ready && username ? (
              <>
                <span className="text-sm text-slate-600">
                  Signed in as{" "}
                  <span className="font-semibold text-slate-900">{username}</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    logout();
                  }}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                >
                  Sign out
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={focusSignIn}
                className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-slate-700"
              >
                Sign in
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        {itemMatch ? (
          <ItemPage id={Number(itemMatch[1])} />
        ) : isInventory ? (
          <InventoryPage />
        ) : (
          <NotFound />
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-4 text-xs text-slate-500">
          Warehouse inventory &middot; data is stored in SQLite
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <RouterProvider>
      <AuthProvider>
        <Shell />
      </AuthProvider>
    </RouterProvider>
  );
}
